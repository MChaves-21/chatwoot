/**
 * Kanban — integracao: busca no servidor (search.js) e os webhooks do n8n
 * (lead do Supabase, resumo por IA, Agendar).
 */
import { searchEverywhere } from 'dashboard/routes/dashboard/kanban/search';
import {
  fetchLead,
  fetchSummary,
  readSessionAuth,
  scheduleMessage,
} from 'dashboard/routes/dashboard/kanban/api';
import { useKanbanBoard } from 'dashboard/routes/dashboard/kanban/useKanbanBoard';
import {
  clearSessionCookie,
  mockFetch,
  SESSION,
  useFakeChatwoot,
} from '../../support/setup';

describe('Busca do topo (contacts/search + conversas do contato)', () => {
  function seed(fake) {
    const ana = fake.addContact({
      id: 900,
      name: 'Ana Ercília',
      phone: '+5585995270000',
    });
    fake.addConversation({
      id: 1,
      contactId: ana.id,
      inboxId: 6,
      labels: ['comercial'],
    });
    fake.addConversation({
      id: 2,
      contactId: ana.id,
      inboxId: 15,
      labels: ['bpc_pegar_senha'],
    });
    // Caixa que nao e de funil: fica fora.
    fake.addConversation({ id: 3, contactId: ana.id, inboxId: 99, labels: [] });
    fake.addConversation({
      id: 4,
      contactId: ana.id,
      inboxId: 6,
      labels: ['desqualificado'],
      status: 'resolved',
    });
    const bob = fake.addContact({
      id: 901,
      name: 'Bob',
      phone: '+5511900000000',
    });
    fake.addConversation({ id: 5, contactId: bob.id, inboxId: 16, labels: [] });
  }

  it('acha por nome e devolve as conversas das caixas dos funis, com funil e etapa', async () => {
    const { fake } = useFakeChatwoot();
    seed(fake);
    const r = await searchEverywhere('ana');
    expect(r.kind).toBe('contacts');
    expect(r.results.map(x => [x.id, x.funnel, x.stage])).toEqual([
      [1, 'Auxílio Acidente', 'Comercial'],
      [4, 'Auxílio Acidente', 'Desqualificado'],
      [2, 'BPC', 'Pegar senha'],
    ]);
    expect(r.results.find(x => x.id === 4).state).toBe('Fechado');
    expect(r.results[0]).toMatchObject({
      name: 'Ana Ercília',
      phone: '+5585995270000',
      inboxId: 6,
    });
  });

  it('telefone digitado com mascara vira so digitos na busca', async () => {
    const { fake } = useFakeChatwoot();
    seed(fake);
    const r = await searchEverywhere('(85) 99527-0000');
    expect(r.results.length).toBe(3);
    const [call] = fake.calls('GET', /contacts\/search/);
    expect(call.query).toContain('q=85995270000');
  });

  it('conta parceira acha a caixa 16 (F&P)', async () => {
    const { fake } = useFakeChatwoot();
    seed(fake);
    const r = await searchEverywhere('bob');
    expect(r.results.map(x => [x.id, x.funnel])).toEqual([
      [5, 'Auxílio Acidente'],
    ]);
  });

  it('termo de estado nao vai ao servidor', async () => {
    const { fake } = useFakeChatwoot();
    const r = await searchEverywhere('aguardando');
    expect(r).toMatchObject({ kind: 'state', results: [] });
    expect(r.term.key).toBe('aguardando');
    expect(fake.state.log).toHaveLength(0);
  });

  it('menos de 3 letras nao busca', async () => {
    const { fake } = useFakeChatwoot();
    expect(await searchEverywhere('an')).toEqual({ kind: 'idle', results: [] });
    expect(fake.state.log).toHaveLength(0);
  });

  it('busca cancelada para no meio', async () => {
    const { fake } = useFakeChatwoot();
    seed(fake);
    const ctrl = new AbortController();
    ctrl.abort();
    expect(await searchEverywhere('ana', { signal: ctrl.signal })).toEqual({
      kind: 'aborted',
      results: [],
    });
  });

  it('falha nas conversas de UM contato nao derruba a busca', async () => {
    const { fake } = useFakeChatwoot();
    seed(fake);
    fake.addContact({ id: 902, name: 'Ana Outra', phone: '' });
    fake.failNext('GET', '/contacts/902/conversations', 500);
    const r = await searchEverywhere('ana');
    expect(r.results.map(x => x.id)).toEqual([1, 4, 2]);
  });

  it('nenhum contato', async () => {
    useFakeChatwoot();
    expect(await searchEverywhere('zzzz')).toEqual({
      kind: 'contacts',
      results: [],
    });
  });
});

describe('Webhooks do n8n', () => {
  afterEach(() => {
    clearSessionCookie();
  });

  it('readSessionAuth le o cookie da sessao do dashboard', () => {
    useFakeChatwoot();
    expect(readSessionAuth()).toEqual(SESSION);
    clearSessionCookie();
    expect(readSessionAuth()).toEqual({
      'access-token': '',
      client: '',
      uid: '',
    });
  });

  it('fetchLead manda a sessao (nao o segredo) e aceita objeto ou lista', async () => {
    useFakeChatwoot();
    const { calls } = mockFetch(() => ({ body: [{ id: 5, SEGURADO: true }] }));
    expect(await fetchLead({ url: 'https://n8n/lead', phone: '+55' })).toEqual({
      id: 5,
      SEGURADO: true,
    });
    expect(calls[0].body).toEqual({ phone: '+55', auth: SESSION });
    expect(calls[0].body.secret).toBeUndefined();
  });

  it('fetchLead devolve null para resposta sem lead, erro ou sem url', async () => {
    useFakeChatwoot();
    mockFetch(() => ({ body: { mensagem: 'nada' } }));
    expect(await fetchLead({ url: 'u', phone: '1' })).toBeNull();
    mockFetch(() => ({ status: 401, body: {} }));
    expect(await fetchLead({ url: 'u', phone: '1' })).toBeNull();
    mockFetch(() => {
      throw new Error('rede');
    });
    expect(await fetchLead({ url: 'u', phone: '1' })).toBeNull();
    expect(await fetchLead({ url: '', phone: '1' })).toBeNull();
    expect(await fetchLead({ url: 'u', phone: '' })).toBeNull();
  });

  it('fetchSummary aceita os formatos do n8n', async () => {
    useFakeChatwoot();
    const args = {
      url: 'u',
      secret: 's',
      conversationId: 1,
      phone: '1',
      messages: [],
    };
    mockFetch(() => ({ body: { summary: 'A' } }));
    expect(await fetchSummary(args)).toBe('A');
    mockFetch(() => ({ body: [{ resumo: 'B' }] }));
    expect(await fetchSummary(args)).toBe('B');
    mockFetch(() => ({ body: { json: { resumo: 'C' } } }));
    expect(await fetchSummary(args)).toBe('C');
    mockFetch(() => ({ body: {} }));
    expect(await fetchSummary(args)).toBeNull();
    expect(await fetchSummary({ ...args, secret: '' })).toBeNull();
  });

  describe('scheduleMessage (Agendar)', () => {
    const base = {
      url: 'https://n8n/agendar',
      auth: SESSION,
      conversationId: 1,
      inboxId: 6,
      phone: '+55',
      contactName: 'Ana',
      scheduledAt: '2026-11-05T12:00:00.000Z',
      content: 'Bom dia',
    };

    it('sucesso com corpo vazio (Respond Immediately) e com JSON', async () => {
      const { calls } = mockFetch(() => ({ text: '' }));
      expect(await scheduleMessage(base)).toEqual({ ok: true });
      expect(calls[0].body).toMatchObject({
        auth: SESSION,
        conversation_id: 1,
        inbox_id: 6,
        scheduled_at: '2026-11-05T12:00:00.000Z',
        content: 'Bom dia',
      });
      mockFetch(() => ({ body: { ok: true } }));
      expect(await scheduleMessage(base)).toEqual({ ok: true });
      mockFetch(() => ({ text: 'gravado' }));
      expect(await scheduleMessage(base)).toEqual({ ok: true });
    });

    it('recusa do n8n chega ao atendente com o motivo', async () => {
      mockFetch(() => ({ status: 400, body: { error: 'Data no passado' } }));
      expect(await scheduleMessage(base)).toEqual({
        ok: false,
        error: 'Data no passado',
      });
      mockFetch(() => ({ status: 502, text: '<html>' }));
      expect(await scheduleMessage(base)).toEqual({
        ok: false,
        error: 'O n8n respondeu 502.',
      });
      mockFetch(() => ({ body: [{ ok: false }] }));
      expect(await scheduleMessage(base)).toEqual({
        ok: false,
        error: 'O n8n recusou o agendamento.',
      });
      mockFetch(() => ({ body: { error: 'Sessao expirada' } }));
      expect(await scheduleMessage(base)).toEqual({
        ok: false,
        error: 'Sessao expirada',
      });
    });

    it('sem url ou sem rede', async () => {
      expect(await scheduleMessage({ ...base, url: '' })).toEqual({
        ok: false,
        error: 'Webhook de agendamento não configurado.',
      });
      mockFetch(() => {
        throw new Error('Failed to fetch');
      });
      expect(await scheduleMessage(base)).toEqual({
        ok: false,
        error: 'Failed to fetch',
      });
    });
  });

  it('enrichLeads busca cada telefone uma vez so e guarda no cache', async () => {
    window.localStorage.clear();
    const { fake } = useFakeChatwoot();
    fake.addConversation({
      inboxId: 6,
      labels: ['sdr'],
      phone: '+5585111111111',
    });
    fake.addConversation({
      inboxId: 6,
      labels: ['comercial'],
      phone: '+5585111111111',
    });
    fake.addConversation({
      inboxId: 6,
      labels: ['sdr'],
      phone: '+5585222222222',
    });
    fake.addConversation({ inboxId: 6, labels: ['sdr'], phone: '' });
    const { calls } = mockFetch((url, body) => ({
      body: body.phone === '+5585111111111' ? { id: 1, SEGURADO: 't' } : [],
    }));
    const board = useKanbanBoard(1);
    board.prefs.leadUrl = 'https://n8n/lead';
    await board.loadAll();
    await board.enrichLeads();
    expect(calls.map(c => c.body.phone).sort()).toEqual([
      '+5585111111111',
      '+5585222222222',
    ]);
    expect(board.leadCache['+5585111111111']).toMatchObject({ SEGURADO: 't' });
    expect(board.leadCache['+5585222222222']).toBeNull();
    // Segunda vez nao chama de novo; filtro por bandeira usa o cache.
    await board.enrichLeads();
    expect(calls).toHaveLength(2);
    board.filters.flag = 'SEGURADO';
    expect(board.visibleIn('sdr')).toHaveLength(1);
    expect(board.countLabel('sdr')).toBe('1/3');
  });
});
