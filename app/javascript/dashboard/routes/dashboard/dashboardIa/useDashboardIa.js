/**
 * Dashboard IA — estado da tela.
 *
 * A base (linhas) fica num cache do modulo por alguns minutos: sair do painel
 * e voltar nao refaz ~100 requisicoes. O botao Atualizar ignora o cache.
 */

import { computed, reactive, ref } from 'vue';
import DashboardIaAPI from './api';
import {
  ALL_FUNNELS_ID,
  DASH_FUNNELS,
  DEFAULT_MONTHLY_GOAL,
  DEFAULT_PERIOD,
  LS_KEY,
} from './constants';
import {
  assigneeOptions,
  byState,
  closing,
  filterPeriod,
  filterScope,
  funnelSteps,
  kpis,
  monthlyGoal,
  newChats,
  spParts,
  stageTable,
  weeklySeries,
} from './metrics';

const CACHE_TTL_MS = 5 * 60 * 1000;
const SIGNED_LS_KEY = `${LS_KEY}_assinaturas`;

const cache = { rows: null, at: 0 };

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
  const error = ref('');
  const progress = reactive({ fetched: 0, total: 0 });
  const loadedAt = ref(0);

  // { idDaConversa: ms }. So id e data — nada de nome ou telefone — entao
  // pode ficar no navegador: data de assinatura nao muda, e reler o historico
  // de cada contrato a cada visita seria o pedaco mais caro do painel.
  const signedAt = reactive(readLS(SIGNED_LS_KEY, {}));
  const signedPending = ref(0);

  const funnelId = ref(prefs.funnelId || ALL_FUNNELS_ID);
  const period = ref(prefs.period || DEFAULT_PERIOD);
  const mode = ref('criacao');
  const assigneeId = ref(null);
  const chatDays = ref(30);
  const goal = ref(Number(prefs.goal) > 0 ? Number(prefs.goal) : DEFAULT_MONTHLY_GOAL);

  const savePrefs = () =>
    writeLS(LS_KEY, {
      funnelId: funnelId.value,
      period: period.value,
      goal: goal.value,
    });

  const todayYmd = computed(() => spParts(loadedAt.value || Date.now()).ymd);

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
    }))
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

  /** Le do historico a data de assinatura dos contratos que ainda nao tem. */
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

  async function load({ force = false } = {}) {
    if (loading.value) return;
    if (!force && cache.rows && Date.now() - cache.at < CACHE_TTL_MS) {
      rows.value = cache.rows;
      loadedAt.value = cache.at;
      loadSignedDates();
      return;
    }

    loading.value = true;
    error.value = '';
    progress.fetched = 0;
    progress.total = 0;
    try {
      const data = await DashboardIaAPI.scan({
        inboxIds: DASH_FUNNELS.map(f => f.inboxId).filter(Boolean),
        onProgress: p => {
          progress.fetched = p.fetched;
          progress.total = p.total;
        },
      });
      cache.rows = data;
      cache.at = Date.now();
      rows.value = data;
      loadedAt.value = cache.at;
    } catch (e) {
      error.value =
        (e && e.message) || 'Não foi possível ler as conversas do Chatwoot.';
    } finally {
      loading.value = false;
    }
    if (!error.value) loadSignedDates();
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

  function setGoal(value) {
    const n = Math.round(Number(value));
    if (!Number.isFinite(n) || n <= 0) return;
    goal.value = n;
    savePrefs();
  }

  return {
    // estado
    rows,
    loading,
    error,
    progress,
    loadedAt,
    signedPending,
    // filtros
    funnelId,
    period,
    mode,
    assigneeId,
    chatDays,
    goal,
    assignees,
    // contas
    summary,
    sparks,
    byFunnel,
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
