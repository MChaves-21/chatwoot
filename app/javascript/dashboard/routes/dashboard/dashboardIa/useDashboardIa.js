/**
 * Dashboard IA — estado da tela.
 *
 * Duas fontes para a mesma base de linhas:
 *
 *   'servidor'  endpoint do fork (uma requisicao; traz historico de etapas e
 *               metas compartilhadas). E o caminho normal.
 *   'navegador' plano B: le as conversas pela API comum, pagina a pagina, e a
 *               data de assinatura conversa a conversa. Entra sozinho quando
 *               o endpoint falha (imagem antiga, usuario nao administrador).
 *
 * A base fica num cache do modulo por alguns minutos: sair do painel e voltar
 * nao refaz a leitura. O botao Atualizar ignora o cache.
 */

import { computed, reactive, ref } from 'vue';
import DashboardIaAPI, { fetchLossReasons } from './api';
import {
  ALL_FUNNELS_ID,
  DASH_FUNNELS,
  DEFAULT_MONTHLY_GOAL,
  DEFAULT_PERIOD,
  LOSS_REASONS_FUNNEL_ID,
  LS_KEY,
} from './constants';
import {
  assigneeOptions,
  byAssignee,
  byState,
  closing,
  filterPeriod,
  filterScope,
  funnelSteps,
  kpis,
  monthlyGoal,
  newChats,
  signedAtFromHistory,
  spParts,
  stageDurations,
  stageTable,
  toRowFromSnapshot,
  weeklySeries,
} from './metrics';

const CACHE_TTL_MS = 5 * 60 * 1000;
const SIGNED_LS_KEY = `${LS_KEY}_assinaturas`;

const cache = { rows: null, at: 0, source: '', goals: null };
const reasonsCache = { data: null, at: 0 };

function readLS(key, fallback) {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (e) {
    return fallback;
  }
}

function writeLS(key, value) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    // localStorage cheio ou bloqueado: o painel funciona sem lembrar.
  }
}

export function useDashboardIa() {
  const prefs = readLS(LS_KEY, {});

  const rows = ref([]);
  const loading = ref(false);
  const refreshing = ref(false);
  const error = ref('');
  const progress = reactive({ fetched: 0, total: 0 });
  const loadedAt = ref(0);
  const source = ref('');

  // { idDaConversa: ms }. So id e data — nada de nome ou telefone — entao
  // pode ficar no navegador: data de assinatura nao muda.
  const signedAt = reactive(readLS(SIGNED_LS_KEY, {}));
  const signedPending = ref(0);

  // Motivos de descarte (n8n). `null` = nao veio: o bloco some.
  const lossReasons = ref(null);
  // O dado e da base inteira do Auxilio Acidente, sem filtro de periodo nem
  // de responsavel — so faz sentido mostrar quando o funil esta na tela.
  const showLossReasons = computed(
    () =>
      !!lossReasons.value &&
      [ALL_FUNNELS_ID, LOSS_REASONS_FUNNEL_ID].includes(funnelId.value)
  );

  async function loadLossReasons({ force = false } = {}) {
    if (!force && reasonsCache.data && Date.now() - reasonsCache.at < CACHE_TTL_MS) {
      lossReasons.value = reasonsCache.data;
      return;
    }
    const data = await fetchLossReasons();
    reasonsCache.data = data;
    reasonsCache.at = Date.now();
    lossReasons.value = data;
  }

  const funnelId = ref(prefs.funnelId || ALL_FUNNELS_ID);
  const period = ref(prefs.period || DEFAULT_PERIOD);
  const customFrom = ref('');
  const customTo = ref('');
  const mode = ref('criacao');
  const assigneeId = ref(null);
  const chatDays = ref(30);

  // Metas por funil ({ idDoFunil: n }; ALL_FUNNELS_ID e a meta geral). Vem do
  // servidor quando ha endpoint; senao, do navegador. `prefs.goal` e o
  // formato antigo (uma meta so), lido como meta geral.
  const goals = reactive({
    ...(Number(prefs.goal) > 0 ? { [ALL_FUNNELS_ID]: Number(prefs.goal) } : {}),
    ...(prefs.goals || {}),
  });
  const goalError = ref('');

  const goal = computed(() => {
    const own = Number(goals[funnelId.value]);
    if (own > 0) return own;
    // Meta geral tem padrao; meta de um funil so existe se alguem definir.
    return funnelId.value === ALL_FUNNELS_ID ? DEFAULT_MONTHLY_GOAL : 0;
  });

  const savePrefs = () =>
    writeLS(LS_KEY, {
      funnelId: funnelId.value,
      // Periodo personalizado nao e lembrado: abrir o painel amanha num
      // intervalo antigo mostraria numero "errado" sem ninguem lembrar por que.
      period: period.value === 'custom' ? DEFAULT_PERIOD : period.value,
      goals: { ...goals },
    });

  const todayYmd = computed(() => spParts(loadedAt.value || Date.now()).ymd);
  const hasHistory = computed(() => source.value === 'servidor');

  const funnels = computed(() =>
    funnelId.value === ALL_FUNNELS_ID
      ? DASH_FUNNELS
      : DASH_FUNNELS.filter(f => f.id === funnelId.value)
  );

  // Opcoes de responsavel saem do funil escolhido, sem o filtro de
  // responsavel — senao a lista encolheria para a propria escolha.
  const assignees = computed(() =>
    assigneeOptions(
      filterScope(rows.value, { funnelId: funnelId.value, assigneeId: null })
    )
  );

  const scopeRows = computed(() =>
    filterScope(rows.value, {
      funnelId: funnelId.value,
      assigneeId: assigneeId.value,
    })
  );

  const periodRows = computed(() =>
    filterPeriod(scopeRows.value, {
      period: period.value,
      mode: mode.value,
      todayYmd: todayYmd.value,
      custom: { from: customFrom.value, to: customTo.value },
    })
  );

  const summary = computed(() => kpis(periodRows.value));

  const sparks = computed(() =>
    weeklySeries(scopeRows.value, { todayYmd: todayYmd.value })
  );

  const byFunnel = computed(() =>
    funnels.value.map(f => ({
      funnel: f,
      stages: stageTable(periodRows.value, f),
      steps: funnelSteps(periodRows.value, f),
      durations: stageDurations(periodRows.value, f),
    }))
  );

  // Ranking ignora o filtro de responsavel: filtrar por uma pessoa e ver um
  // ranking de uma linha so nao serve para nada.
  const ranking = computed(() =>
    byAssignee(
      filterPeriod(
        filterScope(rows.value, { funnelId: funnelId.value, assigneeId: null }),
        {
          period: period.value,
          mode: mode.value,
          todayYmd: todayYmd.value,
          custom: { from: customFrom.value, to: customTo.value },
        }
      )
    )
  );

  const closingTime = computed(() => closing(periodRows.value, signedAt));

  const goalData = computed(() =>
    monthlyGoal(scopeRows.value, signedAt, {
      goal: goal.value,
      todayYmd: todayYmd.value,
    })
  );

  const chats = computed(() =>
    newChats(scopeRows.value, {
      days: chatDays.value,
      todayYmd: todayYmd.value,
    })
  );

  const states = computed(() => byState(periodRows.value));

  /** Plano B: le do historico de cada conversa a data de assinatura. */
  async function loadSignedDates() {
    const targets = [];
    rows.value.forEach(r => {
      if (!r.signed || signedAt[r.id]) return;
      const f = DASH_FUNNELS.find(x => x.id === r.funnelId);
      targets.push({
        id: r.id,
        stopLabel: f.signedFrom,
        labels: f.path.slice(f.path.indexOf(f.signedFrom)),
      });
    });
    if (!targets.length) return;

    signedPending.value = targets.length;
    await DashboardIaAPI.signedDates(targets, {
      onEach: (id, at) => {
        if (at) signedAt[id] = at;
        signedPending.value -= 1;
      },
    });
    signedPending.value = 0;
    writeLS(SIGNED_LS_KEY, { ...signedAt });
  }

  function apply(data) {
    rows.value = data.rows;
    loadedAt.value = data.at;
    source.value = data.source;
    if (data.goals) Object.assign(goals, data.goals);
    if (data.source === 'servidor') {
      data.rows.forEach(r => {
        const at = signedAtFromHistory(r);
        if (at) signedAt[r.id] = at;
      });
    } else {
      loadSignedDates();
    }
  }

  async function fetchFromServer(inboxIds) {
    const d = await DashboardIaAPI.snapshot({ inboxIds });
    const agents = d.agents || {};
    const stages = d.stages || {};
    return {
      rows: d.rows
        .map(item =>
          toRowFromSnapshot(item, { agents, stages: stages[item[0]] || {} })
        )
        .filter(Boolean),
      goals: d.goals || {},
      source: 'servidor',
    };
  }

  async function fetchFromBrowser(inboxIds) {
    const data = await DashboardIaAPI.scan({
      inboxIds,
      onProgress: p => {
        progress.fetched = p.fetched;
        progress.total = p.total;
      },
    });
    return { rows: data, goals: null, source: 'navegador' };
  }

  /**
   * `silent` recarrega sem trocar a tela pelo aviso de carregando — usado
   * pela atualizacao automatica do Modo TV.
   */
  async function load({ force = false, silent = false } = {}) {
    if (loading.value || refreshing.value) return;
    loadLossReasons({ force });
    if (!force && cache.rows && Date.now() - cache.at < CACHE_TTL_MS) {
      apply(cache);
      return;
    }

    const flag = silent && rows.value.length ? refreshing : loading;
    flag.value = true;
    error.value = '';
    progress.fetched = 0;
    progress.total = 0;
    const inboxIds = DASH_FUNNELS.map(f => f.inboxId).filter(Boolean);
    try {
      let data;
      try {
        data = await fetchFromServer(inboxIds);
      } catch (e) {
        data = await fetchFromBrowser(inboxIds);
      }
      Object.assign(cache, data, { at: Date.now() });
      apply(cache);
    } catch (e) {
      error.value =
        (e && e.message) || 'Não foi possível ler as conversas do Chatwoot.';
    } finally {
      flag.value = false;
    }
  }

  function setFunnel(id) {
    funnelId.value = id;
    // O responsavel escolhido pode nao existir no outro funil; manter o
    // filtro deixaria o painel zerado sem explicacao.
    assigneeId.value = null;
    savePrefs();
  }

  function setPeriod(key) {
    period.value = key;
    savePrefs();
  }

  /**
   * Meta do funil selecionado (ou a geral, em "Todos os funis"). Com o
   * endpoint, grava no servidor e todos passam a ver; sem ele, fica so neste
   * navegador.
   */
  async function setGoal(value) {
    const n = Math.round(Number(value));
    if (!Number.isFinite(n) || n <= 0) return;
    goalError.value = '';
    goals[funnelId.value] = n;
    savePrefs();
    if (source.value !== 'servidor') return;
    try {
      const saved = await DashboardIaAPI.saveGoals({ [funnelId.value]: n });
      Object.assign(goals, saved);
      cache.goals = { ...goals };
    } catch (e) {
      goalError.value =
        'A meta não foi salva no servidor; ficou só neste navegador.';
    }
  }

  return {
    // estado
    rows,
    loading,
    refreshing,
    error,
    progress,
    loadedAt,
    source,
    hasHistory,
    signedPending,
    lossReasons,
    showLossReasons,
    // filtros
    funnelId,
    period,
    customFrom,
    customTo,
    mode,
    assigneeId,
    chatDays,
    goal,
    goalError,
    assignees,
    // contas
    summary,
    sparks,
    byFunnel,
    ranking,
    closingTime,
    goalData,
    chats,
    states,
    // acoes
    load,
    setFunnel,
    setPeriod,
    setGoal,
  };
}
