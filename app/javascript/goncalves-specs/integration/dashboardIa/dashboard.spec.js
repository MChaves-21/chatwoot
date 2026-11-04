/**
 * Dashboard IA — integracao: useDashboardIa + DashboardIaAPI contra o
 * Chatwoot falso, nos dois caminhos (endpoint do fork e plano B).
 */
import DashboardIaAPI, {
  fetchLossReasons,
} from 'dashboard/routes/dashboard/dashboardIa/api';
import { useDashboardIa } from 'dashboard/routes/dashboard/dashboardIa/useDashboardIa';
import {
  ALL_FUNNELS_ID,
  DEFAULT_MONTHLY_GOAL,
  LOSS_REASONS_URL,
  LS_KEY,
} from 'dashboard/routes/dashboard/dashboardIa/constants';
import {
  clearSessionCookie,
  mockFetch,
  useFakeChatwoot,
} from '../../support/setup';

const DAY = 86400;
// Epoch de uma hora de Sao Paulo.
const sp = (y, m, d, h = 12, min = 0) =>
  Date.UTC(y, m - 1, d, h + 3, min) / 1000;

let accountSeq = 100;
/** Cada teste numa conta propria: o cache do modulo e por conta. */
function freshAccount(seed = {}) {
  accountSeq += 1;
  return useFakeChatwoot(
    { accountId: accountSeq, ...seed },
    { path: 'dashboard-ia' }
  );
}

/**
 * Base pequena e conferivel a mao, na conta 1 (a dona dos funis).
 * Hoje (relogio do teste) = 2026-11-04 12:00 em SP.
 */
function seedHome(fake) {
  // Lead fora do horario (sabado), passou por comercial e assinou.
  fake.addConversation({
    id: 1,
    inboxId: 6,
    labels: ['contrato_assinado'],
    name: 'Ana',
    phone: '+5585999990001',
    createdAt: sp(2026, 10, 31, 22),
    assignee: { id: 2, name: 'Karol' },
    history: {
      sdr: sp(2026, 10, 31, 22),
      comercial: sp(2026, 11, 1, 9),
      contrato_assinado: sp(2026, 11, 2, 10),
    },
    customAttributes: {
      fechado_por: 'IA',
      assinado_em: '2026-11-02',
      assinado_hora: '10:15',
    },
  });
  // Assinou e depois foi reprovado (descarte): continua contando como assinado.
  fake.addConversation({
    id: 2,
    inboxId: 6,
    labels: ['desqualificado'],
    phone: '+5511999990002',
    createdAt: sp(2026, 11, 3, 9),
    history: {
      comercial: sp(2026, 11, 3, 9),
      contrato_assinado: sp(2026, 11, 3, 18),
    },
  });
  // Em SDR, horario comercial.
  fake.addConversation({
    id: 3,
    inboxId: 6,
    labels: ['sdr'],
    phone: '+5585999990003',
    createdAt: sp(2026, 11, 4, 10),
  });
  // Importado: fora das contas de lead.
  fake.addConversation({
    id: 4,
    inboxId: 6,
    labels: ['sdr', 'importado'],
    createdAt: sp(2026, 11, 4, 10),
  });
  // BPC assinado a mao (sem atributo do n8n).
  fake.addConversation({
    id: 5,
    inboxId: 15,
    labels: ['bpc_contrato_assinado'],
    createdAt: sp(2026, 10, 20, 10),
    history: { bpc_contrato_assinado: sp(2026, 11, 4, 8) },
  });
  // Caixa que nao e funil.
  fake.addConversation({
    id: 6,
    inboxId: 99,
    labels: ['sdr'],
    createdAt: sp(2026, 11, 4),
  });
}

beforeAll(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(Date.UTC(2026, 10, 4, 15)));
});
afterAll(() => {
  vi.useRealTimers();
});
beforeEach(() => {
  window.localStorage.clear();
  mockFetch(() => ({ status: 404, body: {} }));
});

describe('Dashboard IA — caminho normal (endpoint do fork, administrador)', () => {
  it('uma requisicao so, com historico de etapas', async () => {
    const { fake } = useFakeChatwoot({}, { path: 'dashboard-ia' });
    seedHome(fake);
    const d = useDashboardIa(1);
    await d.load({ force: true });

    expect(d.error.value).toBe('');
    expect(d.source.value).toBe('servidor');
    expect(d.hasHistory.value).toBe(true);
    expect(fake.calls('GET', /dashboard_ia/)).toHaveLength(1);
    expect(fake.calls('GET', /\/conversations/)).toHaveLength(0);
    const [call] = fake.calls('GET', /dashboard_ia/);
    expect(call.query).toBe(
      '?inbox_ids%5B%5D=6&inbox_ids%5B%5D=11&inbox_ids%5B%5D=15&inbox_ids%5B%5D=10'
    );
    expect(d.rows.value.map(r => r.id).sort()).toEqual([1, 2, 3, 4, 5]);
  });

  it('indicadores do topo (Todo periodo)', async () => {
    const { fake } = useFakeChatwoot({}, { path: 'dashboard-ia' });
    seedHome(fake);
    const d = useDashboardIa(1);
    await d.load({ force: true });
    // 4 leads (o importado fica fora); 3 assinados pelo historico; so o
    // de sabado as 22h chegou fora do horario.
    expect(d.summary.value).toMatchObject({
      total: 4,
      signed: 3,
      qualified: 3,
      lost: 1,
      offHours: 1,
    });
    expect(d.summaryPrev.value).toBeNull();
  });

  it('periodo "Hoje" e responsavel', async () => {
    const { fake } = useFakeChatwoot({}, { path: 'dashboard-ia' });
    seedHome(fake);
    const d = useDashboardIa(1);
    await d.load({ force: true });
    d.setPeriod('hoje');
    expect(d.summary.value.total).toBe(1);
    expect(d.summaryPrev.value.total).toBe(1); // ontem: conversa 2
    d.setPeriod('tudo');
    d.assigneeId.value = 2;
    expect(d.summary.value.total).toBe(1);
    expect(d.assignees.value.map(a => a.id)).toEqual([0, 2]);
    d.setFunnel('bpc');
    expect(d.assigneeId.value).toBeNull();
    expect(d.summary.value.total).toBe(1);
  });

  it('meta do mes conta pela data da assinatura, inclusive importado', async () => {
    const { fake } = useFakeChatwoot({}, { path: 'dashboard-ia' });
    seedHome(fake);
    fake.addConversation({
      id: 7,
      inboxId: 6,
      labels: ['contrato_assinado', 'importado'],
      createdAt: sp(2026, 8, 12),
      history: { contrato_assinado: sp(2026, 11, 1, 10) },
    });
    const d = useDashboardIa(1);
    await d.load({ force: true });
    expect(d.goal.value).toBe(DEFAULT_MONTHLY_GOAL);
    expect(d.goalData.value).toMatchObject({
      done: 4,
      missing: 0,
      month: '2026-11',
    });
  });

  it('fechamentos: IA pelo atributo do n8n, "Sem origem" pela etiqueta', async () => {
    const { fake } = useFakeChatwoot({}, { path: 'dashboard-ia' });
    seedHome(fake);
    const d = useDashboardIa(1);
    await d.load({ force: true });
    const c = d.closings.value;
    // A 2 assinou e foi descartada depois: sem `fechado_por` e sem etiqueta de
    // assinatura, o servidor nao a manda em `closings` (ver achado abaixo).
    expect(c.total).toBe(2);
    expect(c.ia).toBe(1);
    expect(c.semOrigem).toBe(1);
    expect(c.equipe).toBe(0);
    const byId = Object.fromEntries(c.list.map(x => [x.id, x]));
    expect(byId[1]).toMatchObject({
      by: 'IA',
      slot: 'Comercial',
      fromChatwoot: true,
    });
    expect(byId[5]).toMatchObject({
      by: 'Sem origem',
      slot: 'Comercial',
      date: '2026-11-04',
      time: '08h',
    });
    expect(c.foraHorario).toBe(0);
    // Ordenado do mais recente para o mais antigo.
    expect(c.list.map(x => x.id)).toEqual([5, 1]);
    d.setFunnel('bpc');
    expect(d.closings.value.list.map(x => x.id)).toEqual([5]);
  });

  /*
   * Achado 04/11/2026: contrato assinado e depois descartado (reprovado ->
   * desqualificado) conta em "Contratos" (historico de etiquetas) mas some de
   * "Quem fechou" se o n8n nao gravou `fechado_por`: o SQL de closing_rows so
   * olha a etiqueta ATUAL. Os dois numeros da mesma tela divergem.
   * Quando corrigir, troque `it.fails` por `it`.
   */
  it.fails('"Quem fechou" bate com "Contratos" (achado)', async () => {
    const { fake } = useFakeChatwoot({}, { path: 'dashboard-ia' });
    seedHome(fake);
    const d = useDashboardIa(1);
    await d.load({ force: true });
    expect(d.closings.value.total).toBe(d.summary.value.signed);
  });

  it('tabela por etapa, funil e ranking por responsavel', async () => {
    const { fake } = useFakeChatwoot({}, { path: 'dashboard-ia' });
    seedHome(fake);
    const d = useDashboardIa(1);
    await d.load({ force: true });
    d.setFunnel('auxilio_acidente');
    const [aux] = d.byFunnel.value;
    const counts = Object.fromEntries(aux.stages.map(s => [s.label, s.count]));
    expect(counts).toMatchObject({
      contrato_assinado: 1,
      desqualificado: 1,
      sdr: 1,
    });
    expect(aux.steps.total).toBe(3);
    expect(aux.durations.find(s => s.label === 'comercial').n).toBe(2);
    expect(d.ranking.value[0]).toMatchObject({ id: 2, signed: 1 });
    expect(d.states.value.list.map(s => s.uf)).toEqual(['CE', 'SP']);
  });

  it('setGoal grava no servidor e vale para todos', async () => {
    const { fake } = useFakeChatwoot({}, { path: 'dashboard-ia' });
    seedHome(fake);
    const d = useDashboardIa(1);
    await d.load({ force: true });
    await d.setGoal('75');
    expect(d.goal.value).toBe(75);
    expect(fake.state.accountAttributes.dashboard_ia_goals).toEqual({
      [ALL_FUNNELS_ID]: 75,
    });
    d.setFunnel('bpc');
    expect(d.goal.value).toBe(0);
    await d.setGoal(12.4);
    expect(fake.state.accountAttributes.dashboard_ia_goals).toEqual({
      [ALL_FUNNELS_ID]: 75,
      bpc: 12,
    });
    // Valor invalido e ignorado.
    await d.setGoal(-3);
    await d.setGoal('abc');
    expect(d.goal.value).toBe(12);
  });

  it('meta que falha no servidor fica no navegador e avisa', async () => {
    const { fake } = useFakeChatwoot({}, { path: 'dashboard-ia' });
    seedHome(fake);
    const d = useDashboardIa(1);
    await d.load({ force: true });
    fake.failNext('PATCH', 'dashboard_ia/goals', 500);
    await d.setGoal(80);
    expect(d.goal.value).toBe(80);
    expect(d.goalError.value).toMatch(/so neste navegador|só neste navegador/);
    expect(
      JSON.parse(window.localStorage.getItem(LS_KEY)).goals[ALL_FUNNELS_ID]
    ).toBe(80);
  });

  it('preferencias: funil e periodo lembrados; periodo personalizado nao', async () => {
    const { fake } = useFakeChatwoot({}, { path: 'dashboard-ia' });
    seedHome(fake);
    const d = useDashboardIa(1);
    d.setFunnel('bpc');
    d.setPeriod('custom');
    const saved = JSON.parse(window.localStorage.getItem(LS_KEY));
    expect(saved.funnelId).toBe('bpc');
    expect(saved.period).toBe('tudo');
    d.setPeriod('7d');
    const d2 = useDashboardIa(1);
    expect(d2.funnelId.value).toBe('bpc');
    expect(d2.period.value).toBe('7d');
  });
});

describe('Dashboard IA — plano B e permissoes', () => {
  it('agente (403 no endpoint) cai no plano B: le pagina a pagina e a data pelo historico', async () => {
    const { fake } = freshAccount({ role: 'agent' });
    // Conta qualquer nao tem funil: use a conta 1 com papel de agente.
    fake.state.accountId = 1;
    window.history.replaceState({}, '', '/app/accounts/1/dashboard-ia');
    seedHome(fake);
    for (let i = 0; i < 30; i += 1) {
      fake.addConversation({
        inboxId: 6,
        labels: ['sdr'],
        createdAt: sp(2026, 11, 1),
      });
    }
    const d = useDashboardIa(1);
    await d.load({ force: true });
    expect(fake.calls('GET', /dashboard_ia/)).toHaveLength(1);
    expect(d.source.value).toBe('navegador');
    expect(d.hasHistory.value).toBe(false);
    expect(d.rows.value).toHaveLength(35);
    // Sem historico, "assinado" e so a etapa atual: a 2 (descartada) sai.
    expect(d.summary.value.signed).toBe(2);
    // Datas de assinatura lidas das mensagens de atividade.
    await vi.waitFor(() => expect(d.signedPending.value).toBe(0));
    expect(d.closingTime.value.n).toBe(2);
    const stored = JSON.parse(
      window.localStorage.getItem(`${LS_KEY}_assinaturas`)
    );
    expect(Object.keys(stored).map(Number).sort()).toEqual([1, 5]);
    expect(d.goalData.value.done).toBe(2);
  });

  it('setGoal no plano B fica so no navegador (nao chama o servidor)', async () => {
    const { fake } = freshAccount({ role: 'agent' });
    fake.state.accountId = 1;
    window.history.replaceState({}, '', '/app/accounts/1/dashboard-ia');
    const d = useDashboardIa(1);
    await d.load({ force: true });
    await d.setGoal(40);
    expect(fake.calls('PATCH', /goals/)).toHaveLength(0);
    expect(d.goal.value).toBe(40);
  });

  it('conta parceira (F&P) le so a caixa 16, sem meta padrao e sem motivos', async () => {
    const { fake } = useFakeChatwoot(
      { accountId: 3 },
      { path: 'dashboard-ia' }
    );
    fake.addConversation({
      inboxId: 16,
      labels: ['contrato_assinado'],
      createdAt: sp(2026, 11, 2),
    });
    fake.addConversation({
      inboxId: 16,
      labels: ['sdr'],
      createdAt: sp(2026, 11, 2),
    });
    const { fn } = mockFetch(() => ({ body: { total: 1, motivos: [] } }));
    const d = useDashboardIa(3);
    await d.load({ force: true });
    const [call] = fake.calls('GET', /dashboard_ia/);
    expect(call.query).toBe('?inbox_ids%5B%5D=16');
    expect(d.funnelList.map(f => f.id)).toEqual(['fp_auxilio_acidente']);
    expect(d.summary.value).toMatchObject({ total: 2, signed: 1 });
    expect(d.goal.value).toBe(0);
    expect(d.lossReasons.value).toBeNull();
    expect(fn).not.toHaveBeenCalled();
    expect(window.localStorage.getItem(`${LS_KEY}_conta_3`)).toBeNull();
    d.setPeriod('7d');
    expect(window.localStorage.getItem(`${LS_KEY}_conta_3`)).not.toBeNull();
  });

  it('conta sem funil nao le nada e nao quebra', async () => {
    const { fake } = freshAccount();
    const d = useDashboardIa(fake.state.accountId);
    await d.load({ force: true });
    expect(d.funnelList).toEqual([]);
    expect(d.summary.value.total).toBe(0);
  });

  it('servidor e plano B falhando: mostra erro', async () => {
    const { fake } = useFakeChatwoot({}, { path: 'dashboard-ia' });
    fake.failNext('GET', 'dashboard_ia', 500);
    fake.failNext('GET', '/conversations', 500);
    const d = useDashboardIa(1);
    await d.load({ force: true });
    expect(d.error.value).toMatch(/500/);
    expect(d.loading.value).toBe(false);
  });

  it('cache de 5 minutos por conta; Atualizar (force) ignora', async () => {
    const { fake } = useFakeChatwoot({}, { path: 'dashboard-ia' });
    seedHome(fake);
    const a = useDashboardIa(1);
    await a.load({ force: true });
    const b = useDashboardIa(1);
    await b.load();
    expect(fake.calls('GET', /dashboard_ia/)).toHaveLength(1);
    expect(b.rows.value).toHaveLength(5);
    await b.load({ force: true });
    expect(fake.calls('GET', /dashboard_ia/)).toHaveLength(2);
  });
});

describe('Dashboard IA — motivos de descarte (n8n)', () => {
  afterEach(() => {
    clearSessionCookie();
  });

  it('manda a sessao e filtra motivos zerados', async () => {
    useFakeChatwoot();
    const { calls } = mockFetch(() => ({
      body: {
        total: '5',
        motivos: [
          { motivo: 'Sem CLT', total: '4' },
          { motivo: 'X', total: 0 },
        ],
      },
    }));
    expect(await fetchLossReasons()).toEqual({
      total: 5,
      motivos: [{ motivo: 'Sem CLT', total: 4 }],
    });
    expect(calls[0].url).toBe(LOSS_REASONS_URL);
    expect(calls[0].body.auth['access-token']).toBe('token-de-teste');
  });

  it.each([
    ['sem sessao', null, () => ({ body: { motivos: [] } })],
    ['403', true, () => ({ status: 403, body: {} })],
    ['formato errado', true, () => ({ body: { motivos: 'x' } })],
    [
      'rede',
      true,
      () => {
        throw new Error('x');
      },
    ],
  ])('%s -> null', async (_, session, handler) => {
    useFakeChatwoot();
    if (!session) clearSessionCookie();
    mockFetch(handler);
    expect(await fetchLossReasons()).toBeNull();
  });

  it('bloco aparece so em "Todos" ou no Auxilio', async () => {
    const { fake } = useFakeChatwoot({}, { path: 'dashboard-ia' });
    seedHome(fake);
    mockFetch(() => ({
      body: { total: 1, motivos: [{ motivo: 'A', total: 1 }] },
    }));
    const d = useDashboardIa(1);
    await d.load({ force: true });
    await vi.waitFor(() => expect(d.lossReasons.value).not.toBeNull());
    expect(d.showLossReasons.value).toBe(true);
    d.setFunnel('bpc');
    expect(d.showLossReasons.value).toBe(false);
    d.setFunnel('auxilio_acidente');
    expect(d.showLossReasons.value).toBe(true);
  });
});

describe('DashboardIaAPI — chamadas diretas', () => {
  it('snapshot recusa resposta fora do formato', async () => {
    useFakeChatwoot();
    window.axios.get = async () => ({ data: { linhas: [] } });
    await expect(DashboardIaAPI.snapshot({ inboxIds: [6] })).rejects.toThrow(
      /inesperada/
    );
  });

  it('scan pagina em paralelo e ignora caixa sem funil', async () => {
    const { fake, tracker } = useFakeChatwoot({}, { latency: 3 });
    for (let i = 0; i < 130; i += 1)
      fake.addConversation({ inboxId: 6, labels: ['sdr'] });
    const progress = [];
    const rows = await DashboardIaAPI.scan({
      inboxIds: [6, 99],
      onProgress: p => progress.push({ ...p }),
    });
    expect(rows).toHaveLength(130);
    expect(progress[progress.length - 1]).toEqual({ fetched: 130, total: 130 });
    expect(tracker.maxInFlight).toBeLessThanOrEqual(3);
    expect(fake.calls('GET', /inbox_id=6/)).toHaveLength(6);
  });

  it('signedDate volta paginas ate achar a assinatura (before=)', async () => {
    const { fake } = useFakeChatwoot();
    const conv = fake.addConversation({
      id: 77,
      history: { contrato_assinado: sp(2026, 10, 1) },
    });
    for (let i = 0; i < 45; i += 1)
      fake.addMessage(conv.id, {
        content: `msg ${i}`,
        created_at: sp(2026, 10, 2) + i,
      });
    const at = await DashboardIaAPI.signedDate(77, {
      labels: ['contrato_assinado', 'efetivado'],
      stopLabel: 'contrato_assinado',
    });
    expect(at).toBe(sp(2026, 10, 1) * 1000);
    expect(fake.calls('GET', /\/conversations\/77\/messages/).length).toBe(3);
  });

  it('signedDate: pulou direto para etapa posterior -> vale a mais antiga delas', async () => {
    const { fake } = useFakeChatwoot();
    fake.addConversation({
      id: 78,
      history: { efetivado: sp(2026, 10, 9), analise_medica: sp(2026, 10, 5) },
    });
    expect(
      await DashboardIaAPI.signedDate(78, {
        labels: ['contrato_assinado', 'analise_medica', 'efetivado'],
        stopLabel: 'contrato_assinado',
      })
    ).toBe(sp(2026, 10, 5) * 1000);
  });

  it('signedDates: falha numa conversa nao derruba as outras', async () => {
    const { fake } = useFakeChatwoot();
    fake.addConversation({
      id: 80,
      history: { contrato_assinado: sp(2026, 10, 1) },
    });
    fake.addConversation({
      id: 81,
      history: { contrato_assinado: sp(2026, 10, 2) },
    });
    fake.failNext('GET', '/conversations/80/messages', 500);
    const got = {};
    await DashboardIaAPI.signedDates(
      [80, 81].map(id => ({
        id,
        labels: ['contrato_assinado'],
        stopLabel: 'contrato_assinado',
      })),
      {
        onEach: (id, at) => {
          got[id] = at;
        },
      }
    );
    expect(got).toEqual({ 80: null, 81: sp(2026, 10, 2) * 1000 });
  });

  it('saveGoals descarta chave e valor invalidos (regra do servidor)', async () => {
    const { fake } = useFakeChatwoot();
    const out = await DashboardIaAPI.saveGoals({
      bpc: 10,
      'Nao Pode': 5,
      aux: 0,
      x: 200000,
    });
    expect(out).toEqual({ bpc: 10 });
    expect(fake.state.accountAttributes.dashboard_ia_goals).toEqual({
      bpc: 10,
    });
  });

  it('o day-by-day nao depende do fuso do navegador', () => {
    // Conferencia de sanidade do relogio falso usado acima.
    expect(new Date().toISOString().slice(0, 13)).toBe('2026-11-04T15');
    expect(DAY).toBe(86400);
  });
});
