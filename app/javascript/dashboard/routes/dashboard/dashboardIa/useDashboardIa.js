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
  DEFAULT_MONTHLY_GOAL,
  DEFAULT_PERIOD,
  LOSS_REASONS_FUNNEL_ID,
  LS_KEY,
  funnelsForAccount,
  isHomeAccount,
} from './constants';
import {
  assigneeOptions,
  byAssignee,
  byState,
  closing,
  filterPeriod,
  filterRange,
  filterScope,
  funnelSteps,
  isBusinessHour,
  kpis,
  monthlyGoal,
  newChats,
  periodRange,
  previousRange,
  signedAtFromHistory,
  spParts,
  stageDurations,
  stageTable,
  toRowFromSnapshot,
  weekdayOf,
  weeklySeries,
} from './metrics';

const CACHE_TTL_MS = 5 * 60 * 1000;

// Cache do modulo POR CONTA: quem e administrador de duas contas e troca de
// uma para a outra nao pode ver, por alguns minutos, os numeros da anterior.
const caches = new Map();
function cacheFor(accountId) {
  const key = String(accountId);
  if (!caches.has(key)) {
    caches.set(key, { rows: null, at: 0, source: '', goals: null });
  }
  return caches.get(key);
}
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

export function useDashboardIa(accountId) {
  const home = isHomeAccount(accountId);
  // Funis desta conta. Fora da conta dona: lista vazia (ver HOME_ACCOUNT_ID).
  const accountFunnels = funnelsForAccount(accountId);
  const cache = cacheFor(accountId);
  // Preferencias e datas de assinatura do navegador tambem separadas por
  // conta (a conta dona mantem as chaves antigas).
  const lsKey = home ? LS_KEY : `${LS_KEY}_conta_${accountId}`;
  const signedLsKey = `${lsKey}_assinaturas`;
  const prefs = readLS(lsKey, {});

  const rows = ref([]);
  const loading = ref(false);
  const refreshing = ref(false);
  const error = ref('');
  const progress = reactive({ fetched: 0, total: 0 });
  const loadedAt = ref(0);
  const source = ref('');

  // { idDaConversa: ms }. So id e data — nada de nome ou telefone — entao
  // pode ficar no navegador: data de assinatura nao muda.
  const signedAt = reactive(readLS(signedLsKey, {}));
  const signedPending = ref(0);

  // Motivos de descarte (n8n). `null` = nao veio: o bloco some.
  const lossReasons = ref(null);
  // Fechamentos vindos do servidor (quem fechou cada contrato).
  const closingsAll = ref([]);
  // O dado e da base inteira do Auxilio Acidente, sem filtro de periodo nem
  // de responsavel — so faz sentido mostrar quando o funil esta na tela.
  const showLossReasons = computed(
    () =>
      !!lossReasons.value &&
      [ALL_FUNNELS_ID, LOSS_REASONS_FUNNEL_ID].includes(funnelId.value)
  );

  async function loadLossReasons({ force = false } = {}) {
    // Motivos vem da LEADS PREV, que e so da conta dona.
    if (!home) {
      lossReasons.value = null;
      return;
    }
    if (!force && reasonsCache.data && Date.now() - reasonsCache.at < CACHE_TTL_MS) {
      lossReasons.value = reasonsCache.data;
      return;
    }
    const data = await fetchLossReasons();
    reasonsCache.data = data;
    reasonsCache.at = Date.now();
    lossReasons.value = data;
  }

  const savedFunnel = accountFunnels.some(f => f.id === prefs.funnelId)
    ? prefs.funnelId
    : ALL_FUNNELS_ID;
  const funnelId = ref(savedFunnel);
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
    // A meta padrao e a da conta dona; outra conta comeca sem meta.
    return home && funnelId.value === ALL_FUNNELS_ID ? DEFAULT_MONTHLY_GOAL : 0;
  });

  const savePrefs = () =>
    writeLS(lsKey, {
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
      ? accountFunnels
      : accountFunnels.filter(f => f.id === funnelId.value)
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

  // Mesmo calculo no periodo anterior de mesmo tamanho, para as setas de
  // subiu/caiu. null em "Todo periodo" (nao ha anterior).
  const summaryPrev = computed(() => {
    const range = previousRange(period.value, todayYmd.value, {
      from: customFrom.value,
      to: customTo.value,
    });
    return range ? kpis(filterRange(scopeRows.value, range, mode.value)) : null;
  });

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

  // A meta conta contrato, inclusive de conversa importada em lote.
  const goalData = computed(() =>
    monthlyGoal(
      filterScope(rows.value, {
        funnelId: funnelId.value,
        assigneeId: assigneeId.value,
        withImported: true,
      }),
      signedAt,
      {
        goal: goal.value,
        todayYmd: todayYmd.value,
      }
    )
  );

  const chats = computed(() =>
    newChats(scopeRows.value, {
      days: chatDays.value,
      todayYmd: todayYmd.value,
    })
  );

  const states = computed(() => byState(periodRows.value));

  // Fechamentos do periodo e do funil escolhidos: quem fechou (IA ou equipe),
  // se foi fora do horario e se o lead veio do Chatwoot. A data e a da
  // assinatura, nao a da conversa.
  //
  // A faixa (Comercial / Fora do horario / Fim de semana) e recalculada aqui
  // com BUSINESS_HOURS em vez de usar a que o n8n grava: o fluxo gravou ate
  // 26/10/2026 com corte as 18h.
  //
  // "Veio do Chatwoot": a conversa ja existia antes da assinatura e nao e de
  // importacao em lote. "Fora do Chatwoot" do n8n e o contrario: a conversa
  // foi aberta depois de assinado (26/10/2026: os 6 casos, 1 dia depois).
  const closings = computed(() => {
    const inboxes = new Set(funnels.value.map(f => f.inboxId));
    const range = periodRange(period.value, todayYmd.value, {
      from: customFrom.value,
      to: customTo.value,
    });
    const byId = new Map(rows.value.map(r => [r.id, r]));
    const slotOf = (ymd, hour) => {
      const wd = weekdayOf(ymd);
      if (wd === 0 || wd === 6) return 'Fim de semana';
      return isBusinessHour(wd, hour) ? 'Comercial' : 'Fora do horário';
    };
    const filled = closingsAll.value
      .map(c => {
        // Gravado pelo n8n: data e hora (HH:MM) da assinatura, no fuso do escritorio.
        if (c.by) {
          const hour = Number(String(c.time).slice(0, 2));
          return {
            ...c,
            at: Date.parse(`${c.date}T${c.time}:00-03:00`),
            slot: slotOf(c.date, hour),
          };
        }
        // Sem o atributo do n8n (etapa movida a mao): vale a data em que a
        // conversa recebeu a etiqueta de contrato assinado. Quem fechou nao
        // da para saber — fica "Sem origem", nunca presumido como equipe.
        const at = signedAt[c.id];
        if (!at) return null;
        const p = spParts(at);
        const hh = String(p.hour).padStart(2, '0');
        return {
          ...c,
          by: 'Sem origem',
          at,
          date: p.ymd,
          time: `${hh}h`,
          slot: slotOf(p.ymd, p.hour),
        };
      })
      .filter(Boolean)
      .map(c => {
        const row = byId.get(c.id);
        return {
          ...c,
          fromChatwoot: !!row && !row.imported && c.at >= row.createdMs,
        };
      });
    const list = filled
      .filter(c => inboxes.has(c.inboxId))
      .filter(c => !range || (c.date >= range.from && c.date <= range.to))
      .sort((a, b) => b.at - a.at);
    const count = by => list.filter(c => c.by === by).length;
    return {
      list,
      total: list.length,
      ia: count('IA'),
      equipe: count('Equipe'),
      fora: count('Fora do Chatwoot'),
      semOrigem: count('Sem origem'),
      fromChatwoot: list.filter(c => c.fromChatwoot).length,
      foraHorario: list.filter(c => c.slot !== 'Comercial').length,
    };
  });

  /** Plano B: le do historico de cada conversa a data de assinatura. */
  async function loadSignedDates() {
    const targets = [];
    rows.value.forEach(r => {
      if (!r.signed || signedAt[r.id]) return;
      const f = accountFunnels.find(x => x.id === r.funnelId);
      if (!f) return;
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
    writeLS(signedLsKey, { ...signedAt });
  }

  function apply(data) {
    rows.value = data.rows;
    closingsAll.value = data.closings || [];
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
      closings: (d.closings || []).map(c => ({
        id: c[0],
        inboxId: c[1],
        name: c[2] || '',
        by: c[3] || '',
        date: c[4] || '',
        time: c[5] || '',
        slot: c[6] || '',
      })),
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
    const inboxIds = accountFunnels.map(f => f.inboxId).filter(Boolean);
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
    // conta
    funnelList: accountFunnels,
    isHome: home,
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
    summaryPrev,
    sparks,
    byFunnel,
    ranking,
    closingTime,
    goalData,
    chats,
    states,
    closings,
    // acoes
    load,
    setFunnel,
    setPeriod,
    setGoal,
  };
}
