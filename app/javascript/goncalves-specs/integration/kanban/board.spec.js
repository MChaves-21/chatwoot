/**
 * Kanban — integracao: useKanbanBoard + KanbanAPI contra o Chatwoot falso.
 *
 * Aqui nada e mockado dentro do fork: o composable chama a API de verdade, que
 * chama o `axios` — so o servidor e falso (support/fakeChatwoot.js).
 */
import { useKanbanBoard } from 'dashboard/routes/dashboard/kanban/useKanbanBoard';
import KanbanAPI from 'dashboard/routes/dashboard/kanban/api';
import {
  AUXILIO_COLUMNS,
  BPC_COLUMNS,
  COLUMN_CONCURRENCY,
  LS_KEY,
  UNSTAGED_LABEL,
} from 'dashboard/routes/dashboard/kanban/constants';
import { useFakeChatwoot } from '../../support/setup';

const t0 = Math.floor(Date.UTC(2026, 10, 1, 15) / 1000);

function seedAuxilio(fake) {
  fake.addConversation({
    id: 1,
    inboxId: 6,
    labels: ['sdr'],
    name: 'Ana',
    lastActivityAt: t0 + 10,
  });
  fake.addConversation({
    id: 2,
    inboxId: 6,
    labels: ['sdr', 'urgente'],
    name: 'Bia',
    lastActivityAt: t0 + 20,
  });
  fake.addConversation({
    id: 3,
    inboxId: 6,
    labels: ['comercial', 'atendimento_humanizado'],
    name: 'Caio',
    lastActivityAt: t0 + 30,
  });
  // Duas etapas: sdr + desqualificado (o que o Kanban Sync deixa).
  fake.addConversation({
    id: 4,
    inboxId: 6,
    labels: ['sdr', 'desqualificado'],
    name: 'Duda',
    lastActivityAt: t0 + 40,
  });
  // Sem etapa (so etiqueta de qualificacao).
  fake.addConversation({
    id: 5,
    inboxId: 6,
    labels: ['urgente'],
    name: 'Edu',
    lastActivityAt: t0 + 50,
  });
  fake.addConversation({
    id: 6,
    inboxId: 6,
    labels: [],
    name: 'Fabi',
    status: 'resolved',
    lastActivityAt: t0 + 60,
  });
  // Mesma etiqueta em OUTRA caixa: nao pode aparecer no quadro da caixa 6.
  fake.addConversation({ id: 7, inboxId: 15, labels: ['sdr'], name: 'Gil' });
  fake.addConversation({ id: 8, inboxId: 15, labels: [], name: 'Hugo' });
}

const ids = list => list.map(c => c.id).sort((a, b) => a - b);

beforeEach(() => {
  window.localStorage.clear();
});

describe('Kanban — carga das colunas', () => {
  it('cada coluna traz so as conversas da etapa E da caixa do funil', async () => {
    const { fake } = useFakeChatwoot();
    seedAuxilio(fake);
    const board = useKanbanBoard(1);
    await board.loadAll();

    expect(board.activeFunnel.value.inboxId).toBe(6);
    expect(ids(board.visibleIn('sdr'))).toEqual([1, 2]);
    expect(ids(board.visibleIn('comercial'))).toEqual([3]);
    expect(ids(board.visibleIn('desqualificado'))).toEqual([4]);
    expect(board.isLoading.value).toBe(false);
    expect(board.statusText.value).toMatch(/^Atualizado/);
  });

  it('"Sem etapa" usa o filtro do Chatwoot e pega so quem nao tem etapa nenhuma', async () => {
    const { fake } = useFakeChatwoot();
    seedAuxilio(fake);
    const board = useKanbanBoard(1);
    await board.loadAll();

    expect(ids(board.visibleIn(UNSTAGED_LABEL))).toEqual([5, 6]);
    const [call] = fake.calls('POST', /\/conversations\/filter/);
    const { payload } = call.body;
    expect(payload[0]).toMatchObject({
      attribute_key: 'inbox_id',
      values: [6],
    });
    expect(payload[1]).toMatchObject({
      attribute_key: 'labels',
      filter_operator: 'not_equal_to',
    });
    expect(payload[1].values).toEqual(
      AUXILIO_COLUMNS.map(c => c.label).filter(l => l !== UNSTAGED_LABEL)
    );
    expect(payload[1].values).not.toContain(UNSTAGED_LABEL);
  });

  it('descarte vence: card com sdr + desqualificado fica so no descarte e o total desconta', async () => {
    const { fake } = useFakeChatwoot();
    seedAuxilio(fake);
    const board = useKanbanBoard(1);
    await board.loadAll();

    expect(ids(board.visibleIn('sdr'))).not.toContain(4);
    expect(board.countLabel('sdr')).toBe('2');
    expect(board.countLabel('desqualificado')).toBe('1');
    // Nenhuma conversa aparece em duas colunas.
    const all = board.columnDefs.value.flatMap(c =>
      board.visibleIn(c.label).map(x => x.id)
    );
    expect(new Set(all).size).toBe(all.length);
  });

  it('pagina ate o fim com mais de 25 conversas (sem tamanho de pagina fixo)', async () => {
    const { fake } = useFakeChatwoot();
    for (let i = 1; i <= 60; i += 1) {
      fake.addConversation({
        inboxId: 6,
        labels: ['comercial'],
        lastActivityAt: t0 + i,
      });
    }
    const board = useKanbanBoard(1);
    await board.loadAll();
    expect(board.visibleIn('comercial')).toHaveLength(25);
    expect(board.countLabel('comercial')).toBe('60');
    expect(board.hasMore('comercial')).toBe(true);

    await board.loadColumn('comercial');
    await board.loadColumn('comercial');
    expect(board.visibleIn('comercial')).toHaveLength(60);
    expect(board.hasMore('comercial')).toBe(false);
    // Ja terminou: nao pede de novo.
    const before = fake.state.log.length;
    await board.loadColumn('comercial');
    expect(fake.state.log.length).toBe(before);
  });

  it('"Sem etapa" do BPC pagina as 1.000+ conversas (fim do teto de 40 paginas)', async () => {
    const { fake } = useFakeChatwoot();
    for (let i = 0; i < 1100; i += 1)
      fake.addConversation({ inboxId: 15, labels: [] });
    const board = useKanbanBoard(1);
    await board.setFunnel('bpc');
    await board.loadEverything();
    expect(board.visibleIn(UNSTAGED_LABEL)).toHaveLength(1100);
    expect(board.countLabel(UNSTAGED_LABEL)).toBe('1100');
  });

  /*
   * Achado 04/11/2026: loadEverything (Excel, "Criados", "Atualizados") para
   * em MAX_PAGES_PER_COLUMN = 200 paginas = 5.000 cards por coluna. O SDR do
   * 0300 tem ~5.270: o Excel exportado em 04/11 veio com 4.988 SDR e 268
   * leads ficaram de fora da planilha LawChat x Chatwoot (#N/A). Quando
   * corrigir, troque `it.fails` por `it`.
   */
  it.fails(
    'Excel/loadEverything traz coluna com mais de 5.000 cards (achado)',
    async () => {
      const { fake } = useFakeChatwoot();
      for (let i = 0; i < 5030; i += 1) {
        fake.addConversation({ inboxId: 6, labels: ['sdr'] });
      }
      const board = useKanbanBoard(1);
      await board.loadAll();
      await board.loadEverything();
      expect(board.visibleIn('sdr')).toHaveLength(5030);
    }
  );

  it('status escolhido vai para as duas rotas (lista e filtro)', async () => {
    const { fake } = useFakeChatwoot();
    seedAuxilio(fake);
    const board = useKanbanBoard(1);
    board.prefs.status = 'resolved';
    await board.loadAll();
    expect(ids(board.visibleIn(UNSTAGED_LABEL))).toEqual([6]);
    expect(board.visibleIn('sdr')).toEqual([]);
    const [call] = fake.calls('POST', /\/conversations\/filter/);
    expect(call.body.payload[2]).toMatchObject({
      attribute_key: 'status',
      values: ['resolved'],
    });
  });

  it('coluna que falha nao derruba as outras e mostra o erro', async () => {
    const { fake } = useFakeChatwoot();
    seedAuxilio(fake);
    fake.failNext('GET', 'labels%5B%5D=comercial', 500);
    const board = useKanbanBoard(1);
    await board.loadAll();
    expect(board.errors.comercial).toMatch(/500/);
    expect(board.isPending('comercial')).toBe(false);
    expect(ids(board.visibleIn('sdr'))).toEqual([1, 2]);
    // Tentar de novo resolve.
    await board.loadColumn('comercial');
    expect(board.errors.comercial).toBeUndefined();
    expect(ids(board.visibleIn('comercial'))).toEqual([3]);
  });

  it('contador mostra "..." antes da resposta e "visiveis/total" com filtro', async () => {
    const { fake } = useFakeChatwoot();
    seedAuxilio(fake);
    const board = useKanbanBoard(1);
    expect(board.countLabel('sdr')).toBe('...');
    await board.loadAll();
    board.filters.tag = 'urgente';
    expect(board.countLabel('sdr')).toBe('1/2');
    board.clearFilters();
    expect(board.countLabel('sdr')).toBe('2');
  });

  it('carga respeita COLUMN_CONCURRENCY (Puma tem 5 slots)', async () => {
    const { fake, tracker } = useFakeChatwoot({}, { latency: 5 });
    seedAuxilio(fake);
    const board = useKanbanBoard(1);
    await board.loadAll();
    expect(tracker.maxInFlight).toBeLessThanOrEqual(COLUMN_CONCURRENCY);
    expect(tracker.maxInFlight).toBeGreaterThan(1);
  });

  it('allConversations junta as colunas sem repetir', async () => {
    const { fake } = useFakeChatwoot();
    seedAuxilio(fake);
    const board = useKanbanBoard(1);
    await board.loadAll();
    expect(ids(board.allConversations())).toEqual([1, 2, 3, 4, 5, 6]);
  });
});

describe('Kanban — "So trafego" no funil 0300', () => {
  function seed0300(fake) {
    fake.addConversation({ id: 21, inboxId: 11, labels: ['sdr'] });
    fake.addConversation({
      id: 22,
      inboxId: 11,
      labels: ['sdr', 'origem_lawchat'],
    });
    fake.addConversation({ id: 23, inboxId: 11, labels: ['importado'] });
    fake.addConversation({ id: 24, inboxId: 11, labels: [] });
  }

  it('desligado mostra tudo; ligado esconde importados no servidor', async () => {
    const { fake } = useFakeChatwoot();
    seed0300(fake);
    const board = useKanbanBoard(1);
    await board.setFunnel('lawchat_0300');
    expect(ids(board.visibleIn('sdr'))).toEqual([21, 22]);
    expect(ids(board.visibleIn(UNSTAGED_LABEL))).toEqual([23, 24]);

    await board.setHideImported(true);
    expect(board.hideImported.value).toBe(true);
    expect(ids(board.visibleIn('sdr'))).toEqual([21]);
    expect(ids(board.visibleIn(UNSTAGED_LABEL))).toEqual([24]);
    expect(board.countLabel('sdr')).toBe('1');
    expect(JSON.parse(window.localStorage.getItem(LS_KEY)).hideImported).toBe(
      true
    );
  });

  it('a preferencia nao vale em funil que nao tem o botao', async () => {
    const { fake } = useFakeChatwoot();
    fake.addConversation({ inboxId: 6, labels: ['sdr', 'importado'] });
    const board = useKanbanBoard(1);
    board.prefs.hideImported = true;
    await board.loadAll();
    expect(board.hideImported.value).toBe(false);
    expect(board.visibleIn('sdr')).toHaveLength(1);
  });
});

describe('Kanban — mover de etapa', () => {
  async function ready() {
    const { fake } = useFakeChatwoot();
    seedAuxilio(fake);
    const board = useKanbanBoard(1);
    await board.loadAll();
    return { fake, board };
  }
  const card = (board, label, id) =>
    board.visibleIn(label).find(c => c.id === id);

  it('troca so a etapa, preserva o resto e marca `manual`', async () => {
    const { fake, board } = await ready();
    const res = await board.moveToStage(
      card(board, 'sdr', 2),
      'sdr',
      'comercial'
    );
    expect(res).toEqual({ ok: true });
    expect(fake.conversation(2).labels.sort()).toEqual([
      'comercial',
      'manual',
      'urgente',
    ]);
    expect(ids(board.visibleIn('comercial'))).toEqual([2, 3]);
    expect(ids(board.visibleIn('sdr'))).toEqual([1]);
    expect(board.countLabel('comercial')).toBe('2');
    expect(board.countLabel('sdr')).toBe('1');
  });

  it('preserva atendimento_humanizado (o n8n depende dela)', async () => {
    const { fake, board } = await ready();
    await board.moveToStage(
      card(board, 'comercial', 3),
      'comercial',
      'contrato_em_elaboracao'
    );
    expect(fake.conversation(3).labels).toContain('atendimento_humanizado');
  });

  it('descartar desliga o robo e RESOLVE a conversa', async () => {
    const { fake, board } = await ready();
    await board.moveToStage(card(board, 'sdr', 1), 'sdr', 'descarte_sdr');
    const conv = fake.conversation(1);
    expect(conv.labels.sort()).toEqual([
      'atendimento_humanizado',
      'descarte_sdr',
      'manual',
    ]);
    expect(conv.status).toBe('resolved');
    expect(card(board, 'descarte_sdr', 1).status).toBe('resolved');
  });

  it('descartar conversa ja resolvida nao chama toggle_status de novo', async () => {
    const { fake, board } = await ready();
    await board.moveToStage(
      card(board, UNSTAGED_LABEL, 6),
      UNSTAGED_LABEL,
      'desqualificado'
    );
    expect(fake.calls('POST', /toggle_status/)).toHaveLength(0);
  });

  it('coluna de espera (aguardando_tempo) nao resolve nem desliga o robo', async () => {
    const { fake, board } = await ready();
    await board.moveToStage(card(board, 'sdr', 1), 'sdr', 'aguardando_tempo');
    expect(fake.conversation(1).status).toBe('open');
    expect(fake.conversation(1).labels).not.toContain('atendimento_humanizado');
  });

  it('voltar para "Sem etapa" so tira as etiquetas de etapa', async () => {
    const { fake, board } = await ready();
    await board.moveToStage(card(board, 'sdr', 2), 'sdr', UNSTAGED_LABEL);
    expect(fake.conversation(2).labels.sort()).toEqual(['manual', 'urgente']);
    expect(fake.conversation(2).labels).not.toContain(UNSTAGED_LABEL);
    expect(ids(board.visibleIn(UNSTAGED_LABEL))).toContain(2);
  });

  it('falha ao gravar etiqueta desfaz tudo na tela', async () => {
    const { fake, board } = await ready();
    fake.failNext('POST', '/conversations/2/labels', 500);
    const before = [...card(board, 'sdr', 2).labels];
    const res = await board.moveToStage(
      card(board, 'sdr', 2),
      'sdr',
      'comercial'
    );
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/500/);
    expect(ids(board.visibleIn('sdr'))).toEqual([1, 2]);
    expect(ids(board.visibleIn('comercial'))).toEqual([3]);
    expect(card(board, 'sdr', 2).labels).toEqual(before);
    expect(board.countLabel('sdr')).toBe('2');
    expect(fake.conversation(2).labels).toEqual(before);
  });

  it('etiqueta gravada mas status nao: avisa, mantem o card no descarte e o status local', async () => {
    const { fake, board } = await ready();
    fake.failNext('POST', '/conversations/1/toggle_status', 500);
    const res = await board.moveToStage(
      card(board, 'sdr', 1),
      'sdr',
      'desqualificado'
    );
    expect(res.ok).toBe(true);
    expect(res.warning).toMatch(/nao consegui encerrar/);
    expect(ids(board.visibleIn('desqualificado'))).toContain(1);
    expect(card(board, 'desqualificado', 1).status).toBe('open');
    expect(fake.conversation(1).labels).toContain('desqualificado');
  });

  it('card que estava em duas colunas sai das duas e nao duplica no destino (16/10/2026)', async () => {
    const { fake } = useFakeChatwoot();
    fake.addConversation({
      id: 31,
      inboxId: 6,
      labels: ['reprovado_dr_gerardo', 'aprovado_repescagem'],
    });
    const board = useKanbanBoard(1);
    await board.loadAll();
    expect(ids(board.visibleIn('reprovado_dr_gerardo'))).toEqual([31]);
    expect(ids(board.visibleIn('aprovado_repescagem'))).toEqual([31]);

    const c = card(board, 'reprovado_dr_gerardo', 31);
    await board.moveToStage(c, 'reprovado_dr_gerardo', 'aprovado_repescagem');
    expect(ids(board.visibleIn('reprovado_dr_gerardo'))).toEqual([]);
    expect(ids(board.visibleIn('aprovado_repescagem'))).toEqual([31]);
    expect(board.countLabel('aprovado_repescagem')).toBe('1');
    expect(fake.conversation(31).labels.sort()).toEqual([
      'aprovado_repescagem',
      'manual',
    ]);
  });

  it('mover para a mesma coluna nao faz nada', async () => {
    const { fake, board } = await ready();
    const before = fake.state.log.length;
    expect(
      await board.moveToStage(card(board, 'sdr', 1), 'sdr', 'sdr')
    ).toEqual({ ok: true });
    expect(fake.state.log.length).toBe(before);
  });

  it('BPC nao apaga etapa do Auxilio (prefixo bpc_)', async () => {
    const { fake } = useFakeChatwoot();
    fake.addConversation({
      id: 41,
      inboxId: 15,
      labels: ['bpc_lead_novo', 'comercial'],
    });
    const board = useKanbanBoard(1);
    await board.setFunnel('bpc');
    await board.moveToStage(
      card(board, 'bpc_lead_novo', 41),
      'bpc_lead_novo',
      'bpc_qualificado'
    );
    expect(fake.conversation(41).labels.sort()).toEqual([
      'bpc_qualificado',
      'comercial',
      'manual',
    ]);
  });

  it('bpc_finalizado e coluna de espera: nao resolve', async () => {
    const { fake } = useFakeChatwoot();
    fake.addConversation({ id: 42, inboxId: 15, labels: ['bpc_lead_novo'] });
    const board = useKanbanBoard(1);
    await board.setFunnel('bpc');
    await board.moveToStage(
      card(board, 'bpc_lead_novo', 42),
      'bpc_lead_novo',
      'bpc_finalizado'
    );
    expect(fake.conversation(42).status).toBe('open');
    expect(BPC_COLUMNS.some(c => c.label === 'bpc_finalizado')).toBe(true);
  });
});

describe('Kanban — tags, funis e preferencias', () => {
  it('toggleTag liga e desliga sem mexer no resto', async () => {
    const { fake } = useFakeChatwoot();
    seedAuxilio(fake);
    const board = useKanbanBoard(1);
    await board.loadAll();
    const c = board.visibleIn('sdr').find(x => x.id === 1);
    await board.toggleTag(c, 'urgente');
    expect(fake.conversation(1).labels.sort()).toEqual(['sdr', 'urgente']);
    await board.toggleTag(c, 'urgente');
    expect(fake.conversation(1).labels).toEqual(['sdr']);
    fake.failNext('POST', '/labels', 500);
    const res = await board.toggleTag(c, 'urgente');
    expect(res.ok).toBe(false);
    expect(c.labels).toEqual(['sdr']);
  });

  it('trocar de funil zera colunas, filtros e cache de leads', async () => {
    const { fake } = useFakeChatwoot();
    seedAuxilio(fake);
    const board = useKanbanBoard(1);
    await board.loadAll();
    board.filters.q = 'ana';
    board.leadCache['+55'] = { SEGURADO: true };
    await board.setFunnel('bpc');
    expect(board.activeFunnelId.value).toBe('bpc');
    expect(board.filters.q).toBe('');
    expect(Object.keys(board.leadCache)).toEqual([]);
    // A 7 tem `sdr` (etapa do Auxilio): no BPC ela e "Sem etapa".
    expect(ids(board.visibleIn(UNSTAGED_LABEL))).toEqual([7, 8]);
    expect(ids(board.visibleIn('bpc_lead_novo'))).toEqual([]);
    expect(board.visibleIn('sdr')).toEqual([]);
    expect(JSON.parse(window.localStorage.getItem(LS_KEY)).funnelId).toBe(
      'bpc'
    );
  });

  it('funil salvo e reaberto; colunas antigas do localStorage sao descartadas', () => {
    window.localStorage.setItem(
      LS_KEY,
      JSON.stringify({
        funnelId: 'trabalhista',
        columns: [{ label: 'x' }],
        status: 'open',
      })
    );
    useFakeChatwoot();
    const board = useKanbanBoard(1);
    expect(board.activeFunnelId.value).toBe('trabalhista');
    expect(board.prefs.columns).toBeUndefined();
    expect(board.prefs.status).toBe('open');
  });

  it('preferencia corrompida nao impede o quadro de abrir', () => {
    window.localStorage.setItem(LS_KEY, '{nao e json');
    useFakeChatwoot();
    expect(useKanbanBoard(1).activeFunnelId.value).toBe('auxilio_acidente');
  });

  it('conta parceira (F&P) le a caixa 16 mesmo com funil da Goncalves salvo', async () => {
    window.localStorage.setItem(LS_KEY, JSON.stringify({ funnelId: 'bpc' }));
    const { fake } = useFakeChatwoot({ accountId: 3 });
    fake.addConversation({ id: 51, inboxId: 16, labels: ['sdr'] });
    fake.addConversation({ id: 52, inboxId: 16, labels: [] });
    const board = useKanbanBoard(3);
    await board.loadAll();
    expect(board.funnels).toHaveLength(1);
    expect(board.activeFunnel.value.inboxId).toBe(16);
    expect(ids(board.visibleIn('sdr'))).toEqual([51]);
    // F&P nao tem coluna "Sem etapa".
    expect(board.columnDefs.value.some(c => c.label === UNSTAGED_LABEL)).toBe(
      false
    );
    fake
      .calls('GET', /\/conversations\?/)
      .forEach(c => expect(c.path).toMatch(/^\/api\/v1\/accounts\/3\//));
  });
});

describe('KanbanAPI — contrato das chamadas', () => {
  it('listByLabel monta a query com inbox, status e pagina', async () => {
    const { fake } = useFakeChatwoot();
    await KanbanAPI.listByLabel({
      label: 'sdr',
      page: 2,
      status: 'open',
      inboxId: 6,
    });
    const [call] = fake.calls('GET', /\/conversations\?/);
    expect(call.query).toBe('?status=open&page=2&labels%5B%5D=sdr&inbox_id=6');
  });

  it('listByLabel com exclusao usa o filtro e o payload e aceito', async () => {
    const { fake } = useFakeChatwoot();
    fake.addConversation({ inboxId: 6, labels: ['sdr'] });
    fake.addConversation({ inboxId: 6, labels: ['sdr', 'importado'] });
    const r = await KanbanAPI.listByLabel({
      label: 'sdr',
      inboxId: 6,
      status: 'open',
      excludeLabels: ['importado'],
    });
    expect(r.total).toBe(1);
    const [call] = fake.calls('POST', /filter/);
    expect(call.body.payload.map(p => p.query_operator)).toEqual([
      'and',
      'and',
      'and',
      null,
    ]);
  });

  it.each([
    [{ inboxId: null, status: 'all' }, ['and', null]],
    [{ inboxId: 6, status: 'all' }, ['and', 'and', null]],
    [{ inboxId: null, status: 'open' }, ['and', 'and', null]],
  ])(
    'listByLabel com exclusao %j: so o ultimo item fica sem operador',
    async (opts, ops) => {
      const { fake } = useFakeChatwoot();
      await KanbanAPI.listByLabel({
        label: 'sdr',
        excludeLabels: ['importado'],
        ...opts,
      });
      const [call] = fake.calls('POST', /filter/);
      expect(call.body.payload.map(p => p.query_operator)).toEqual(ops);
    }
  );

  it('listByLabel le meta.count quando nao ha all_count', async () => {
    useFakeChatwoot();
    window.axios.get = async () => ({
      data: { data: { meta: { count: 7 }, payload: [{ id: 1 }] } },
    });
    expect((await KanbanAPI.listByLabel({ label: 'x' })).total).toBe(7);
    window.axios.get = async () => ({
      data: { payload: [{ id: 1 }, { id: 2 }] },
    });
    expect((await KanbanAPI.listByLabel({ label: 'x' })).total).toBe(2);
  });

  it('getConversation, getMessages, toggleStatus e nota privada', async () => {
    const { fake } = useFakeChatwoot();
    fake.addConversation({ id: 61, messages: [{ content: 'oi' }] });
    expect((await KanbanAPI.getConversation(61)).id).toBe(61);
    expect((await KanbanAPI.getMessages(61)).map(m => m.content)).toEqual([
      'oi',
    ]);
    await KanbanAPI.toggleStatus(61, 'pending');
    expect(fake.conversation(61).status).toBe('pending');
    await KanbanAPI.createPrivateNote(61, 'agendado');
    const note = fake.state.messages.find(m => m.content === 'agendado');
    expect(note.private).toBe(true);
  });
});
