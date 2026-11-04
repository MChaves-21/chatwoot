/**
 * Relatorio da Equipe e Disparador — integracao das camadas de API com o
 * Chatwoot falso (e com o n8n falso, no Disparador).
 */
import RelatorioEquipeAPI from 'dashboard/routes/dashboard/relatorioEquipe/api';
import {
  callDisparador,
  contactConversations,
  loadAudience,
  searchContacts,
  sendNow,
} from 'dashboard/routes/dashboard/disparador/api';
import {
  buildRecipients,
  conversationOptions,
  samePhone,
  templateMessageBody,
  usableTemplates,
} from 'dashboard/routes/dashboard/disparador/helpers';
import {
  DEFAULT_EXCLUDE,
  DISPARADOR_URL,
} from 'dashboard/routes/dashboard/disparador/constants';
import {
  clearSessionCookie,
  mockFetch,
  SESSION,
  useFakeChatwoot,
} from '../support/setup';

const sp = (y, m, d, h = 12) => Date.UTC(y, m - 1, d, h + 3) / 1000;

describe('Relatorio da Equipe — API', () => {
  function seed(fake) {
    const c = fake.addConversation({ id: 1 });
    fake.addMessage(c.id, {
      content: 'oi',
      message_type: 0,
      created_at: sp(2026, 11, 3),
    });
    fake.addMessage(c.id, {
      content: 'ola',
      message_type: 1,
      created_at: sp(2026, 11, 3, 13),
      sender: { id: 2, type: 'User' },
    });
    fake.addMessage(c.id, {
      content: 'resposta automatica',
      message_type: 1,
      created_at: sp(2026, 11, 4),
      sender: { id: 3, type: 'User' },
    });
    fake.addMessage(c.id, {
      content: 'nota',
      message_type: 1,
      private: true,
      created_at: sp(2026, 11, 4),
    });
  }

  it('summary manda filtros com fuso de Fortaleza e valida o formato', async () => {
    const { fake } = useFakeChatwoot({}, { path: 'relatorio-equipe' });
    seed(fake);
    const data = await RelatorioEquipeAPI.summary({
      since: '2026-11-03',
      until: '2026-11-04',
      inboxId: 6,
      userId: 2,
      label: 'sdr',
    });
    const [call] = fake.calls('GET', /relatorio_equipe/);
    expect(call.query).toBe(
      '?since=2026-11-03&until=2026-11-04&tz=America%2FFortaleza&inbox_ids%5B%5D=6&user_ids%5B%5D=2&labels%5B%5D=sdr'
    );
    expect(data.per_day.map(d => d.date)).toEqual(['2026-11-03', '2026-11-04']);
    expect(data.totals.mensagens).toEqual({
      recebida: 1,
      humano: 2,
      ia: 0,
      sem_autor: 0,
    });
  });

  it('marcar um usuario como IA muda a categoria das mensagens dele', async () => {
    const { fake } = useFakeChatwoot({}, { path: 'relatorio-equipe' });
    seed(fake);
    expect(await RelatorioEquipeAPI.saveIaUsers([3, 999])).toEqual([3]);
    const data = await RelatorioEquipeAPI.summary({
      since: '2026-11-03',
      until: '2026-11-04',
    });
    expect(data.totals.mensagens).toEqual({
      recebida: 1,
      humano: 1,
      ia: 1,
      sem_autor: 0,
    });
    expect(data.ia_user_ids).toEqual([3]);
    expect(data.per_user.find(u => u.id === 3).ia).toBe(true);
  });

  it('agente recebe 403 e a API repassa o erro', async () => {
    useFakeChatwoot({ role: 'agent' }, { path: 'relatorio-equipe' });
    await expect(RelatorioEquipeAPI.summary({})).rejects.toThrow(/403/);
    await expect(RelatorioEquipeAPI.saveIaUsers([1])).rejects.toThrow(/403/);
  });

  it('resposta fora do formato vira erro legivel', async () => {
    useFakeChatwoot({}, { path: 'relatorio-equipe' });
    window.axios.get = async () => ({ data: { per_day: [] } });
    await expect(RelatorioEquipeAPI.summary({})).rejects.toThrow(
      'Resposta inesperada do servidor.'
    );
  });

  it('downloadCsv baixa o arquivo e le o cabecalho de truncado', async () => {
    useFakeChatwoot({}, { path: 'relatorio-equipe' });
    const clicks = [];
    URL.createObjectURL = vi.fn(() => 'blob:x');
    URL.revokeObjectURL = vi.fn();
    const spy = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(function click() {
        clicks.push({ href: this.href, download: this.download });
      });
    window.axios.get = vi.fn(async (url, cfg) => ({
      data: new Blob(['a;b']),
      headers: {
        'x-relatorio-truncado': url.includes('since=2026-01-01') ? '1' : '0',
      },
      cfg,
    }));
    expect(
      await RelatorioEquipeAPI.downloadCsv({
        since: '2026-11-01',
        until: '2026-11-04',
      })
    ).toEqual({ truncated: false });
    expect(
      await RelatorioEquipeAPI.downloadCsv({
        since: '2026-01-01',
        until: '2026-11-04',
      })
    ).toEqual({ truncated: true });
    expect(window.axios.get.mock.calls[0][0]).toContain(
      '/relatorio_equipe/mensagens?'
    );
    expect(window.axios.get.mock.calls[0][1]).toEqual({ responseType: 'blob' });
    expect(clicks[0]).toEqual({
      href: 'blob:x',
      download: 'mensagens_2026-11-01_2026-11-04.csv',
    });
    expect(document.querySelectorAll('a[download]')).toHaveLength(0);
    spy.mockRestore();
  });
});

describe('Disparador — publico e envio', () => {
  afterEach(() => {
    clearSessionCookie();
  });

  it('loadAudience le todas as paginas e o resultado vira lista de envio', async () => {
    const { fake, tracker } = useFakeChatwoot(
      {},
      { path: 'disparador', latency: 2 }
    );
    for (let i = 0; i < 70; i += 1) {
      fake.addConversation({
        inboxId: 15,
        labels: [i % 10 === 0 ? 'bpc_cancelado' : 'bpc_lead_novo'],
      });
    }
    // Mesmo contato com duas conversas.
    const ana = fake.addContact({ name: 'Ana', phone: '+5585999990000' });
    fake.addConversation({
      inboxId: 15,
      labels: ['bpc_lead_novo'],
      contactId: ana.id,
      lastActivityAt: sp(2026, 11, 1),
    });
    fake.addConversation({
      inboxId: 15,
      labels: ['bpc_lead_novo'],
      contactId: ana.id,
      lastActivityAt: sp(2026, 11, 2),
    });
    fake.addConversation({ inboxId: 6, labels: ['bpc_lead_novo'] });

    const progress = [];
    const res = await loadAudience({
      inboxId: 15,
      labels: ['bpc_lead_novo', 'bpc_cancelado'],
      status: 'all',
      onProgress: (n, total) => progress.push([n, total]),
    });
    expect(res.total).toBe(72);
    expect(res.conversations).toHaveLength(72);
    expect(res.truncated).toBe(false);
    expect(progress[progress.length - 1]).toEqual([72, 72]);
    expect(tracker.maxInFlight).toBeLessThanOrEqual(3);

    const r = buildRecipients(res.conversations, { exclude: DEFAULT_EXCLUDE });
    expect(r.excluidas).toBe(7);
    expect(r.duplicadas).toBe(1);
    expect(r.recipients).toHaveLength(64);
  });

  it('busca de contato, conversas e envio de template pela caixa oficial', async () => {
    const { fake } = useFakeChatwoot({}, { path: 'disparador' });
    fake.state.inboxes.find(i => i.id === 15).message_templates = [
      {
        name: 'retomada',
        language: 'pt_BR',
        category: 'MARKETING',
        status: 'APPROVED',
        components: [{ type: 'BODY', text: 'Oi {{1}}, tudo bem?' }],
      },
    ];
    const ana = fake.addContact({ name: '~ana maria', phone: '+558599990000' });
    fake.addConversation({
      id: 5,
      contactId: ana.id,
      inboxId: 15,
      lastActivityAt: sp(2026, 11, 3),
    });
    fake.addConversation({
      id: 6,
      contactId: ana.id,
      inboxId: 6,
      lastActivityAt: sp(2026, 11, 1),
    });

    const [contact] = await searchContacts('9999');
    expect(samePhone(contact.phone_number, '85 99999-0000')).toBe(true);
    const convs = await contactConversations(contact.id);
    const options = conversationOptions(convs, fake.state.inboxes);
    expect(options.map(o => [o.conversation_id, o.oficial])).toEqual([
      [5, true],
      [6, false],
    ]);

    const [tpl] = usableTemplates(
      fake.state.inboxes.find(i => i.id === 15).message_templates
    );
    const body = templateMessageBody(
      tpl,
      { 1: '{{primeiro_nome}}' },
      contact.name
    );
    await sendNow(5, body);
    const sent = fake.state.messages.find(m => m.conversation_id === 5);
    expect(sent.content).toBe('Oi Ana, tudo bem?');
    expect(sent.message_type).toBe(1);
  });

  it('callDisparador manda a sessao e devolve o JSON do n8n', async () => {
    useFakeChatwoot({}, { path: 'disparador' });
    const { calls } = mockFetch(() => ({ body: [{ ok: true, id: 9 }] }));
    expect(await callDisparador('criar', { nome: 'X' })).toEqual({
      ok: true,
      id: 9,
    });
    expect(calls[0].url).toBe(DISPARADOR_URL);
    expect(calls[0].body).toEqual({ acao: 'criar', auth: SESSION, nome: 'X' });
  });

  it.each([
    [
      'recusa com motivo',
      () => ({ status: 400, body: { error: 'Limite de 3000' } }),
      'Limite de 3000',
    ],
    [
      'ok:false com 200',
      () => ({ body: { ok: false, error: 'Nao autorizado' } }),
      'Nao autorizado',
    ],
    [
      'erro sem corpo',
      () => ({ status: 502, text: '' }),
      'O n8n respondeu 502.',
    ],
    [
      'corpo que nao e JSON',
      () => ({ status: 500, text: '<html>' }),
      'O n8n respondeu 500.',
    ],
    [
      'rede',
      () => {
        throw new Error('x');
      },
      'Não foi possível falar com o n8n. Confira a conexão.',
    ],
  ])('callDisparador falha alto: %s', async (_, handler, msg) => {
    useFakeChatwoot({}, { path: 'disparador' });
    mockFetch(handler);
    await expect(callDisparador('listar')).rejects.toThrow(msg);
  });

  it('callDisparador sem sessao nem chama o n8n', async () => {
    useFakeChatwoot({}, { path: 'disparador' });
    clearSessionCookie();
    const { fn } = mockFetch(() => ({ body: {} }));
    await expect(callDisparador('listar')).rejects.toThrow(
      /Sessão do Chatwoot/
    );
    expect(fn).not.toHaveBeenCalled();
  });
});
