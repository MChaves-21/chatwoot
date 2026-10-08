<script setup>
/**
 * Dashboard IA — painel comercial proprio do Chatwoot.
 *
 * Le as mesmas conversas e etiquetas de etapa do Kanban (endpoint do fork,
 * dashboard_ia_controller.rb) e mostra: meta do mes, indicadores contra o
 * periodo anterior, funil por etapa, perdas, equipe, ritmo de cada etapa,
 * fechamento, entrada de leads e geografia.
 *
 * Visual (08/10/2026): proprio, de proposito diferente do LawChat — superficie
 * lisa, uma cor de destaque so (a azul da marca do Chatwoot) e cor de etapa
 * apenas onde a etapa aparece. Secoes com titulo de linha, em vez de cartoes
 * coloridos.
 *
 * O que NAO esta aqui: ranking de anuncios e origem (Facebook/Instagram). O
 * Chatwoot nao guarda de qual anuncio o lead veio.
 */
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import {
  ALL_FUNNELS_ID,
  CHAT_RANGES,
  DASH_FUNNELS,
  DATE_MODES,
  PERIODS,
} from './constants';
import { ymdToBR } from './metrics';
import { useDashboardIa } from './useDashboardIa';
import DashPanel from './components/DashPanel.vue';
import DashKpi from './components/DashKpi.vue';
import DashRing from './components/DashRing.vue';
import DashFlow from './components/DashFlow.vue';
import DashBars from './components/DashBars.vue';
import DashLine from './components/DashLine.vue';
import DashColumns from './components/DashColumns.vue';
import DashHeat from './components/DashHeat.vue';
import DashStack from './components/DashStack.vue';
import DashMap from './components/DashMap.vue';

const ACCENT = '#2781F6';
const MUTED = '#94a3b8';

const dash = useDashboardIa();
const route = useRoute();
const router = useRouter();

// ------------------------------------------------------------- Modo TV
// Tela cheia + recarga sozinha a cada 5 minutos, para deixar num monitor.
const rootEl = ref(null);
const tvMode = ref(false);
const TV_REFRESH_MS = 5 * 60 * 1000;
let tvTimer = null;

function syncTv() {
  tvMode.value = document.fullscreenElement === rootEl.value;
  clearInterval(tvTimer);
  tvTimer = tvMode.value
    ? setInterval(() => dash.load({ force: true, silent: true }), TV_REFRESH_MS)
    : null;
}

function toggleTv() {
  if (document.fullscreenElement) document.exitFullscreen();
  else if (rootEl.value && rootEl.value.requestFullscreen)
    rootEl.value.requestFullscreen();
}

// ----------------------------------------------------------------- PDF
// O Chatwoot carrega o CSS do app com media="screen" (padrao do
// vite_javascript_tag do vite_rails). Na impressao NENHUM estilo se aplica: o
// PDF saia como HTML cru. Enquanto imprime, essas folhas passam a valer para
// "all"; depois voltam ao que eram.
let printSheets = [];

function enablePrintStyles() {
  if (printSheets.length) return;
  printSheets = [
    ...document.querySelectorAll('link[rel="stylesheet"][media="screen"]'),
  ];
  printSheets.forEach(link => {
    link.media = 'all';
  });
}

function restorePrintStyles() {
  printSheets.forEach(link => {
    link.media = 'screen';
  });
  printSheets = [];
}

function printPdf() {
  enablePrintStyles();
  requestAnimationFrame(() => requestAnimationFrame(() => window.print()));
}

onMounted(() => {
  dash.load();
  document.addEventListener('fullscreenchange', syncTv);
  window.addEventListener('beforeprint', enablePrintStyles);
  window.addEventListener('afterprint', restorePrintStyles);
});
onBeforeUnmount(() => {
  document.removeEventListener('fullscreenchange', syncTv);
  window.removeEventListener('beforeprint', enablePrintStyles);
  window.removeEventListener('afterprint', restorePrintStyles);
  restorePrintStyles();
  clearInterval(tvTimer);
});

/** Abre a lista de conversas do Chatwoot com aquela etiqueta de etapa. */
function openStage(label) {
  if (!label || label.startsWith('__')) return;
  router.push({
    name: 'label_conversations',
    params: { accountId: route.params.accountId, label },
  });
}

// ------------------------------------------------------------ formatacao

const int = n => Math.round(Number(n) || 0).toLocaleString('pt-BR');
const dec = (n, digits = 1) =>
  (Number(n) || 0).toLocaleString('pt-BR', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
const pct = n => `${dec(n)}%`;

// ----------------------------------------------------------------- estilos

const SEG_BOX = 'flex p-0.5 gap-0.5 rounded-lg bg-n-alpha-2';
const SEG =
  'px-2.5 py-1 text-xs rounded-md transition-colors whitespace-nowrap';
const SEG_ON = 'bg-n-solid-1 text-n-slate-12 font-semibold shadow-sm';
const SEG_OFF = 'text-n-slate-11 hover:text-n-slate-12';
// O `select` global do Chatwoot (assets/scss/_base.scss) e bloco de largura
// total, com 40px de altura e margem embaixo. Os `!` desfazem isso so aqui.
const SELECT =
  '!w-auto !min-w-[10rem] !mb-0 !h-8 !py-0 !text-xs !rounded-lg !bg-n-solid-1';
const DATE = '!w-36 !mb-0 !h-8 !py-0 !text-xs !rounded-lg !bg-n-solid-1';
const ICON_BTN =
  'flex gap-1.5 items-center px-2.5 h-8 text-xs rounded-lg border transition-colors dia-no-print border-n-weak bg-n-solid-1 text-n-slate-11 hover:text-n-slate-12 hover:bg-n-alpha-1 disabled:opacity-60';
const SECTION =
  'flex gap-3 items-center pt-2 text-[11px] font-semibold tracking-[0.14em] uppercase text-n-slate-10';
const STAT = 'flex flex-col gap-1 min-w-0';
const STAT_LABEL = 'text-xs text-n-slate-11';
const STAT_VALUE =
  'text-xl font-semibold tracking-tight tabular-nums text-n-slate-12';
const NOTE = 'text-xs leading-relaxed text-n-slate-10';

// -------------------------------------------------------------- cabecalho

const funnelTitle = computed(() =>
  dash.funnelId.value === ALL_FUNNELS_ID
    ? 'Todos os funis'
    : (DASH_FUNNELS.find(f => f.id === dash.funnelId.value) || {}).title || ''
);

const periodTitle = computed(() => {
  if (dash.period.value === 'custom') {
    const { customFrom: a, customTo: b } = dash;
    return a.value && b.value
      ? `${ymdToBR(a.value)} a ${ymdToBR(b.value)}`
      : 'escolha as duas datas';
  }
  return (PERIODS.find(p => p.key === dash.period.value) || {}).title || '';
});

const updatedText = computed(() => {
  if (!dash.loadedAt.value) return '';
  return new Date(dash.loadedAt.value).toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
  });
});

const sourceHint = computed(() =>
  dash.source.value === 'navegador'
    ? 'Leitura pelo navegador (plano B): o servidor não respondeu ao painel. Sem histórico de etapas e sem meta compartilhada.'
    : 'Ler as conversas de novo'
);

const progressPct = computed(() =>
  dash.progress.total
    ? Math.min((dash.progress.fetched / dash.progress.total) * 100, 100)
    : 0
);

const funnelOptions = [
  { id: ALL_FUNNELS_ID, title: 'Todos os funis' },
  ...DASH_FUNNELS.map(f => ({ id: f.id, title: f.title })),
];

// ------------------------------------------------------------ indicadores

// Variacao: contagem em % relativo; taxa em pontos percentuais.
const rel = (now, before) =>
  before > 0 ? ((now - before) / before) * 100 : null;
const diff = (now, before) => (before === undefined ? null : now - before);

const kpis = computed(() => {
  const s = dash.summary.value;
  const p = dash.summaryPrev.value;
  const w = dash.sparks.value;
  return [
    {
      key: 'total',
      label: 'Conversas',
      value: int(s.total),
      sub: 'no filtro',
      delta: p ? rel(s.total, p.total) : null,
      values: w.total,
    },
    {
      key: 'signed',
      label: 'Contratos assinados',
      value: int(s.signed),
      sub: 'em contrato assinado ou além',
      hint: 'Conversas que hoje estão em Contrato assinado ou em qualquer etapa depois dela',
      delta: p ? rel(s.signed, p.signed) : null,
      values: w.signed,
    },
    {
      key: 'qualified',
      label: 'Qualificados',
      value: pct(s.qualifiedPct),
      sub: `${int(s.qualified)} leads`,
      hint: 'Leads que chegaram, em algum momento, na etapa de qualificado ou além',
      delta: p ? diff(s.qualifiedPct, p.qualifiedPct) : null,
      unit: 'pp',
      values: w.qualifiedPct,
    },
    {
      key: 'conversion',
      label: 'Conversão',
      value: pct(s.conversion),
      sub: 'assinados ÷ conversas',
      delta: p ? diff(s.conversion, p.conversion) : null,
      unit: 'pp',
      values: w.conversion,
    },
    {
      key: 'efficiency',
      label: 'Eficiência',
      value: pct(s.efficiency),
      sub: 'assinados ÷ qualificados',
      delta: p ? diff(s.efficiency, p.efficiency) : null,
      unit: 'pp',
      values: w.efficiency,
    },
    {
      key: 'lost',
      label: 'Descartados',
      value: pct(s.lostPct),
      sub: `${int(s.lost)} conversas`,
      delta: p ? diff(s.lostPct, p.lostPct) : null,
      unit: 'pp',
      upIsGood: false,
      values: [],
    },
  ];
});

// ------------------------------------------------------------------ meta

const goalMonth = computed(() => {
  const m = dash.goalData.value.month;
  const name = new Date(`${m}-15T12:00:00`).toLocaleDateString('pt-BR', {
    month: 'long',
  });
  return `${name} de ${m.slice(0, 4)}`;
});

const goalScope = computed(() =>
  dash.funnelId.value === ALL_FUNNELS_ID ? 'geral' : funnelTitle.value
);

// Onde o mes deveria estar hoje para fechar a meta (marca no anel).
const goalPace = computed(() => {
  const g = dash.goalData.value;
  const total = g.series.length || 30;
  return g.goal ? ((total - g.daysLeft) / total) * 100 : null;
});

const goalStatus = computed(() => {
  const g = dash.goalData.value;
  if (!g.goal) return null;
  const ahead = g.donePct >= goalPace.value;
  return {
    text: ahead ? 'no ritmo da meta' : 'abaixo do ritmo da meta',
    cls: ahead ? 'text-n-teal-11' : 'text-n-amber-11',
  };
});

const editingGoal = ref(false);
const goalDraft = ref('');

function startGoalEdit() {
  goalDraft.value = dash.goal.value ? String(dash.goal.value) : '';
  editingGoal.value = true;
}

function saveGoal() {
  dash.setGoal(goalDraft.value);
  editingGoal.value = false;
}

const goalPoints = computed(() =>
  dash.goalData.value.series.map(s => ({
    label: `${String(s.day).padStart(2, '0')}/${dash.goalData.value.month.slice(5, 7)}`,
    done: s.done,
    projection: s.projection,
    target: s.target,
  }))
);

const GOAL_SERIES = [
  { key: 'done', label: 'Realizado', color: ACCENT, kind: 'area' },
  { key: 'projection', label: 'Projeção', color: '#93c5fd', kind: 'line' },
  { key: 'target', label: 'Ritmo da meta', color: MUTED, kind: 'dashed' },
];

// ------------------------------------------------------------------ funil

const funnelTab = ref('');

const activeBlock = computed(() => {
  const blocks = dash.byFunnel.value;
  return blocks.find(b => b.funnel.id === funnelTab.value) || blocks[0] || null;
});

const flowSteps = computed(() => {
  const b = activeBlock.value;
  if (!b) return [];
  const colors = new Map(b.funnel.columns.map(c => [c.label, c.color]));
  return b.steps.steps.map(s => ({
    ...s,
    color: colors.get(s.label) || MUTED,
  }));
});

const funnelConversion = computed(() => {
  const b = activeBlock.value;
  if (!b || !b.funnel.signedFrom) return null;
  const step = b.steps.steps.find(s => s.label === b.funnel.signedFrom);
  const signed = step ? step.reached : 0;
  return {
    signed,
    total: b.steps.total,
    pct: b.steps.total ? (signed / b.steps.total) * 100 : 0,
  };
});

const stageNow = computed(() =>
  ((activeBlock.value || {}).stages || []).map(s => ({
    key: s.label,
    title: s.title,
    value: s.count,
    note: pct(s.pct),
    color: s.color,
    muted: s.kind !== 'path',
  }))
);

const offStages = computed(() =>
  ((activeBlock.value || {}).stages || [])
    .filter(s => s.kind !== 'path')
    .map(s => ({
      key: s.label,
      title: s.title,
      value: s.count,
      note: pct(s.pct),
      color: s.color,
    }))
);

const lossItems = computed(() =>
  ((dash.lossReasons.value || {}).motivos || []).map(m => ({
    key: m.motivo,
    title: m.motivo,
    value: m.total,
    note: pct(
      dash.lossReasons.value.total
        ? (m.total / dash.lossReasons.value.total) * 100
        : 0
    ),
  }))
);

// -------------------------------------------------------- equipe e ritmo

const MEDALS = ['#f59e0b', '#94a3b8', '#c2410c'];

const rankingMax = computed(() =>
  Math.max(1, ...dash.ranking.value.map(a => a.signed))
);

const durationItems = computed(() =>
  ((activeBlock.value || {}).durations || [])
    .filter(d => d.n > 0)
    .map(d => ({
      key: d.label,
      title: d.title,
      value: Math.round(d.avgDays * 10) / 10,
      note: `${int(d.n)} leads`,
      color: d.color,
    }))
);

// Soma das medias: quanto tempo, em media, o caminho inteiro leva.
const journeyDays = computed(() =>
  durationItems.value.reduce((a, d) => a + d.value, 0)
);

// -------------------------------------------------------------- fechamento

const closingItems = computed(() =>
  dash.closingTime.value.buckets.map(b => ({
    key: b.key,
    title: b.title,
    value: b.count,
    note: pct(b.pct),
  }))
);

// --------------------------------------------------------- entrada de leads

const chatPoints = computed(() =>
  dash.chats.value.series.map(s => ({
    label: ymdToBR(s.ymd),
    count: s.count,
    avg: s.avg,
  }))
);

const CHAT_SERIES = [
  { key: 'count', label: 'Novos chats', color: ACCENT, kind: 'area' },
  { key: 'avg', label: 'Média móvel (7 dias)', color: MUTED, kind: 'dashed' },
];

const PART_COLORS = {
  manha: '#f59e0b',
  tarde: ACCENT,
  noite: '#6366f1',
  madrugada: MUTED,
};

const partSegments = computed(() =>
  dash.chats.value.parts.map(p => ({
    key: p.key,
    title: p.title,
    value: p.count,
    color: PART_COLORS[p.key],
  }))
);

const signed = n => {
  if (n === null) return '—';
  return `${n > 0 ? '+' : ''}${dec(n, 0)}%`;
};
const signedClass = n => {
  if (n === null || n === 0) return 'text-n-slate-12';
  return n > 0 ? 'text-n-teal-11' : 'text-n-ruby-11';
};

const topDayItems = computed(() =>
  dash.chats.value.top.map(d => ({
    key: d.ymd,
    title: ymdToBR(d.ymd),
    value: d.count,
    note: pct(d.pct),
  }))
);

// --------------------------------------------------------------- geografia

const stateMetric = ref('leads');
const showAllStates = ref(false);

const stateValues = computed(() => {
  const out = {};
  dash.states.value.list.forEach(s => {
    out[s.uf] = s[stateMetric.value];
  });
  return out;
});

const stateItems = computed(() => {
  const field = stateMetric.value;
  const list = dash.states.value.list
    .filter(s => s[field] > 0)
    .sort((a, b) => b[field] - a[field]);
  const total = list.reduce((a, s) => a + s[field], 0);
  const items = list.map(s => ({
    key: s.uf,
    title: s.uf,
    value: s[field],
    note: pct(total ? (s[field] / total) * 100 : 0),
  }));
  return showAllStates.value ? items : items.slice(0, 6);
});

const stateCount = computed(
  () => dash.states.value.list.filter(s => s[stateMetric.value] > 0).length
);
</script>

<template>
  <div
    ref="rootEl"
    class="flex flex-col w-full h-full dia-root bg-n-background"
  >
    <div class="overflow-y-auto flex-1 dia-scroll">
      <div class="flex flex-col gap-5 px-6 py-5 mx-auto max-w-[1440px]">
        <!-- Cabecalho -->
        <header class="flex flex-wrap gap-4 justify-between items-end">
          <div class="min-w-0">
            <p
              class="text-[11px] font-semibold tracking-[0.14em] uppercase text-n-brand"
            >
              Relatório comercial
            </p>
            <h1
              class="mt-1 text-2xl font-semibold tracking-tight text-n-slate-12"
            >
              Dashboard IA
            </h1>
            <p class="mt-1 text-sm text-n-slate-11">
              {{ funnelTitle }} · {{ periodTitle }}
              <template v-if="dash.assigneeId.value !== null">
                ·
                {{
                  (
                    dash.assignees.value.find(
                      a => a.id === dash.assigneeId.value
                    ) || {}
                  ).name
                }}
              </template>
            </p>
          </div>
          <div class="flex gap-2 items-center">
            <span
              v-if="dash.signedPending.value"
              class="text-xs text-n-slate-10"
            >
              Lendo datas de assinatura: faltam {{ dash.signedPending.value }}
            </span>
            <button
              :class="ICON_BTN"
              :disabled="dash.loading.value || dash.refreshing.value"
              :title="sourceHint"
              @click="dash.load({ force: true })"
            >
              <span
                class="rounded-full size-1.5"
                :class="
                  dash.source.value === 'navegador'
                    ? 'bg-n-amber-9'
                    : 'bg-n-teal-9'
                "
              />
              <span v-if="updatedText">{{ updatedText }}</span>
              <span
                class="i-lucide-refresh-cw size-3.5"
                :class="
                  dash.loading.value || dash.refreshing.value
                    ? 'animate-spin'
                    : ''
                "
              />
            </button>
            <button
              :class="ICON_BTN"
              title="Tela cheia, com atualização automática a cada 5 minutos"
              @click="toggleTv"
            >
              <span class="i-lucide-monitor size-3.5" />
              {{ tvMode ? 'Sair' : 'TV' }}
            </button>
            <button
              :class="ICON_BTN"
              title="Gerar PDF (use “Salvar como PDF” na janela de impressão)"
              @click="printPdf"
            >
              <span class="i-lucide-file-down size-3.5" />
              PDF
            </button>
          </div>
        </header>

        <!-- Filtros -->
        <div
          v-show="!tvMode"
          class="flex flex-wrap gap-x-4 gap-y-2 items-center p-2 rounded-xl border dia-no-print border-n-weak bg-n-solid-1"
        >
          <div :class="SEG_BOX">
            <button
              v-for="p in PERIODS"
              :key="p.key"
              :class="[SEG, dash.period.value === p.key ? SEG_ON : SEG_OFF]"
              @click="dash.setPeriod(p.key)"
            >
              {{ p.title }}
            </button>
            <button
              :class="[SEG, dash.period.value === 'custom' ? SEG_ON : SEG_OFF]"
              @click="dash.setPeriod('custom')"
            >
              Personalizado
            </button>
          </div>

          <div
            v-if="dash.period.value === 'custom'"
            class="flex gap-1.5 items-center"
          >
            <input
              v-model="dash.customFrom.value"
              type="date"
              aria-label="Data inicial"
              :class="DATE"
            />
            <span class="text-xs text-n-slate-10">até</span>
            <input
              v-model="dash.customTo.value"
              type="date"
              aria-label="Data final"
              :class="DATE"
            />
          </div>

          <div
            :class="SEG_BOX"
            title="Qual data o período olha: criação da conversa ou última atividade"
          >
            <button
              v-for="m in DATE_MODES"
              :key="m.key"
              :class="[SEG, dash.mode.value === m.key ? SEG_ON : SEG_OFF]"
              @click="dash.mode.value = m.key"
            >
              {{ m.title }}
            </button>
          </div>

          <span class="flex-1" />

          <select
            :class="SELECT"
            :value="dash.funnelId.value"
            aria-label="Funil"
            @change="dash.setFunnel($event.target.value)"
          >
            <option v-for="f in funnelOptions" :key="f.id" :value="f.id">
              {{ f.title }}
            </option>
          </select>

          <select
            :class="SELECT"
            :value="dash.assigneeId.value === null ? '' : dash.assigneeId.value"
            aria-label="Responsável"
            @change="
              dash.assigneeId.value =
                $event.target.value === '' ? null : Number($event.target.value)
            "
          >
            <option value="">Todos os responsáveis</option>
            <option v-for="a in dash.assignees.value" :key="a.id" :value="a.id">
              {{ a.name }} ({{ int(a.count) }})
            </option>
          </select>
        </div>

        <!-- Carregando / erro -->
        <div
          v-if="dash.loading.value"
          class="flex flex-col gap-3 justify-center items-center h-72 rounded-xl border border-n-weak bg-n-solid-1"
        >
          <span class="i-lucide-loader-circle size-6 animate-spin text-n-brand" />
          <span class="text-sm text-n-slate-11">
            Lendo conversas… {{ int(dash.progress.fetched) }}
            <template v-if="dash.progress.total">
              de {{ int(dash.progress.total) }}
            </template>
          </span>
          <span class="overflow-hidden w-72 h-1 rounded-full bg-n-alpha-2">
            <span
              class="block h-full rounded-full transition-all bg-n-brand"
              :style="{ width: `${progressPct}%` }"
            />
          </span>
        </div>

        <div
          v-else-if="dash.error.value"
          class="flex flex-col gap-2 justify-center items-center h-72 rounded-xl border border-n-weak bg-n-solid-1"
        >
          <span class="text-sm font-semibold text-n-slate-12">
            Não deu para montar o painel.
          </span>
          <span class="text-xs text-n-slate-11">{{ dash.error.value }}</span>
          <button
            class="px-3 py-1.5 mt-1 text-xs font-semibold text-white rounded-lg bg-n-brand hover:opacity-90"
            @click="dash.load({ force: true })"
          >
            Tentar de novo
          </button>
        </div>

        <template v-else>
          <!-- Meta + indicadores -->
          <div class="grid gap-4 lg:grid-cols-3 dia-g3">
            <DashPanel>
              <div class="flex justify-between items-start">
                <div>
                  <p class="text-xs text-n-slate-11">
                    Meta {{ goalScope }} · {{ goalMonth }}
                  </p>
                  <p
                    v-if="goalStatus"
                    class="mt-0.5 text-xs font-semibold"
                    :class="goalStatus.cls"
                  >
                    {{ goalStatus.text }}
                  </p>
                </div>
                <form
                  v-if="editingGoal"
                  class="flex gap-1 items-center"
                  @submit.prevent="saveGoal"
                >
                  <input
                    v-model="goalDraft"
                    type="number"
                    min="1"
                    aria-label="Meta mensal de contratos"
                    class="!w-20 !h-8 !mb-0 !py-0 !text-xs"
                  />
                  <button
                    type="submit"
                    class="px-2.5 h-8 text-xs font-semibold text-white rounded-lg bg-n-brand"
                  >
                    Salvar
                  </button>
                </form>
                <button
                  v-else
                  class="flex justify-center items-center rounded-lg dia-no-print size-7 text-n-slate-10 hover:text-n-slate-12 hover:bg-n-alpha-2"
                  :title="
                    dash.hasHistory.value
                      ? `Alterar a meta ${goalScope} (vale para todos)`
                      : `Alterar a meta ${goalScope} (fica só neste navegador)`
                  "
                  aria-label="Alterar a meta"
                  @click="startGoalEdit"
                >
                  <span class="i-lucide-pencil size-3.5" />
                </button>
              </div>

              <p v-if="dash.goalError.value" class="text-xs text-n-ruby-11">
                {{ dash.goalError.value }}
              </p>

              <div class="flex gap-5 items-center">
                <DashRing
                  :percent="dash.goalData.value.donePct"
                  :pace="dash.goalData.value.goal ? goalPace : null"
                >
                  <span
                    class="text-4xl font-semibold tracking-tight tabular-nums text-n-slate-12"
                  >
                    {{ int(dash.goalData.value.done) }}
                  </span>
                  <span class="text-xs text-n-slate-10">
                    <template v-if="dash.goalData.value.goal">
                      de {{ int(dash.goalData.value.goal) }}
                    </template>
                    <template v-else>contratos</template>
                  </span>
                </DashRing>
                <dl
                  v-if="dash.goalData.value.goal"
                  class="flex flex-col gap-3 text-sm"
                >
                  <div>
                    <dt class="text-xs text-n-slate-11">Projeção do mês</dt>
                    <dd class="font-semibold tabular-nums text-n-slate-12">
                      {{ int(dash.goalData.value.projection) }}
                      <span class="font-normal text-n-slate-10">
                        ({{ pct(dash.goalData.value.projectionPct) }})
                      </span>
                    </dd>
                  </div>
                  <div>
                    <dt class="text-xs text-n-slate-11">Faltam</dt>
                    <dd class="font-semibold tabular-nums text-n-slate-12">
                      {{ int(dash.goalData.value.left) }}
                      <span class="font-normal text-n-slate-10">
                        · {{ dec(dash.goalData.value.neededPerDay, 2) }}/dia
                      </span>
                    </dd>
                  </div>
                  <div>
                    <dt class="text-xs text-n-slate-11">Melhor dia</dt>
                    <dd class="font-semibold tabular-nums text-n-slate-12">
                      <template v-if="dash.goalData.value.bestDay">
                        {{ int(dash.goalData.value.bestDay.count) }}
                        <span class="font-normal text-n-slate-10">
                          em
                          {{
                            String(dash.goalData.value.bestDay.day).padStart(
                              2,
                              '0'
                            )
                          }}/{{ dash.goalData.value.month.slice(5, 7) }}
                        </span>
                      </template>
                      <template v-else>—</template>
                    </dd>
                  </div>
                </dl>
                <button
                  v-else
                  class="px-3 py-1.5 text-xs font-semibold text-white rounded-lg dia-no-print bg-n-brand hover:opacity-90"
                  @click="startGoalEdit"
                >
                  Definir meta deste funil
                </button>
              </div>
              <p
                v-if="dash.goalData.value.missing && !dash.signedPending.value"
                :class="NOTE"
              >
                {{ int(dash.goalData.value.missing) }} contrato(s) sem data de
                assinatura não entram na meta.
              </p>
            </DashPanel>

            <DashPanel class="lg:col-span-2 dia-span2">
              <div
                class="grid gap-x-8 gap-y-6 sm:grid-cols-2 xl:grid-cols-3 dia-g3"
              >
                <DashKpi v-for="k in kpis" :key="k.key" v-bind="k" />
              </div>
              <p v-if="!dash.summaryPrev.value" :class="NOTE">
                Escolha um período (7 dias, 30 dias, este mês…) para comparar
                com o período anterior.
              </p>
            </DashPanel>
          </div>

          <!-- Funil -->
          <h2 :class="SECTION">
            Funil
            <span class="flex-1 h-px bg-n-weak" />
            <span
              v-if="dash.byFunnel.value.length > 1"
              :class="SEG_BOX"
              class="tracking-normal normal-case"
            >
              <button
                v-for="b in dash.byFunnel.value"
                :key="b.funnel.id"
                :class="[
                  SEG,
                  activeBlock && activeBlock.funnel.id === b.funnel.id
                    ? SEG_ON
                    : SEG_OFF,
                ]"
                @click="funnelTab = b.funnel.id"
              >
                {{ b.funnel.title }}
              </button>
            </span>
          </h2>

          <template v-if="activeBlock">
            <DashPanel
              :title="`Caminho do lead · ${activeBlock.funnel.title}`"
              subtitle="Leads que chegaram em cada etapa ou além. Em vermelho, a passagem mais fraca. Clique numa coluna para abrir as conversas."
            >
              <template #actions>
                <div class="flex gap-6 text-right">
                  <div :class="STAT">
                    <span :class="STAT_LABEL">Entraram</span>
                    <span :class="STAT_VALUE">
                      {{ int(activeBlock.steps.total) }}
                    </span>
                  </div>
                  <div v-if="funnelConversion" :class="STAT">
                    <span :class="STAT_LABEL">Conversão geral</span>
                    <span :class="STAT_VALUE" class="text-n-brand">
                      {{ pct(funnelConversion.pct) }}
                    </span>
                  </div>
                  <div :class="STAT">
                    <span :class="STAT_LABEL">Fora do caminho</span>
                    <span :class="STAT_VALUE">
                      {{ int(activeBlock.steps.off) }}
                    </span>
                  </div>
                </div>
              </template>
              <DashFlow :steps="flowSteps" @select="openStage" />
              <p v-if="!funnelConversion" :class="NOTE">
                Este funil termina em “Contrato enviado” e não tem etapa de
                contrato assinado.
              </p>
            </DashPanel>

            <div class="grid gap-4 lg:grid-cols-2 dia-g2">
              <DashPanel
                title="Onde estão agora"
                subtitle="Etapa atual de cada conversa, na ordem do Kanban. Em cinza: descartados e em espera."
                icon="i-lucide-layout-list"
              >
                <DashBars :items="stageNow" />
              </DashPanel>

              <DashPanel
                title="Perdas"
                :subtitle="`${int(activeBlock.steps.off)} conversas descartadas, em espera ou sem etapa`"
                icon="i-lucide-circle-x"
              >
                <DashBars
                  :items="offStages"
                  empty="Nenhuma conversa fora do caminho."
                />
                <template v-if="dash.showLossReasons.value">
                  <div class="pt-3 border-t border-n-weak">
                    <p class="mb-3 text-xs font-semibold text-n-slate-12">
                      Por que perdemos · Auxílio Acidente
                      <span class="font-normal text-n-slate-10">
                        ({{ int(dash.lossReasons.value.total) }}
                        desqualificados, base inteira)
                      </span>
                    </p>
                    <DashBars :items="lossItems" color="#e5484d" wide />
                  </div>
                </template>
              </DashPanel>
            </div>
          </template>

          <!-- Equipe e ritmo -->
          <h2 :class="SECTION">
            Equipe e ritmo
            <span class="flex-1 h-px bg-n-weak" />
          </h2>

          <div class="grid gap-4 lg:grid-cols-2 dia-g2">
            <DashPanel
              title="Responsáveis"
              subtitle="Quem tem a conversa atribuída hoje, por contratos"
              icon="i-lucide-users"
            >
              <table class="w-full text-sm">
                <thead>
                  <tr class="text-[11px] text-n-slate-10">
                    <th class="pb-2 font-medium text-left">Responsável</th>
                    <th class="pb-2 font-medium text-right">Leads</th>
                    <th class="pb-2 font-medium text-right">Qualif.</th>
                    <th class="pb-2 pl-4 font-medium text-left">Contratos</th>
                    <th class="pb-2 font-medium text-right">Conv.</th>
                  </tr>
                </thead>
                <tbody>
                  <tr
                    v-for="(a, i) in dash.ranking.value"
                    :key="a.id"
                    class="border-t border-n-weak"
                  >
                    <td class="py-2.5">
                      <span class="flex gap-2 items-center min-w-0">
                        <span
                          class="flex flex-shrink-0 justify-center items-center text-[11px] font-semibold rounded-full size-5"
                          :class="
                            i < 3 && a.id && a.signed
                              ? 'text-white'
                              : 'bg-n-alpha-2 text-n-slate-11'
                          "
                          :style="
                            i < 3 && a.id && a.signed
                              ? { background: MEDALS[i] }
                              : null
                          "
                        >
                          {{ a.id ? i + 1 : '–' }}
                        </span>
                        <span
                          class="truncate"
                          :class="a.id ? 'text-n-slate-12' : 'text-n-slate-10'"
                        >
                          {{ a.name }}
                        </span>
                      </span>
                    </td>
                    <td class="py-2.5 text-right tabular-nums text-n-slate-12">
                      {{ int(a.total) }}
                    </td>
                    <td class="py-2.5 text-right tabular-nums text-n-slate-12">
                      {{ int(a.qualified) }}
                    </td>
                    <td class="py-2.5 pl-4 w-2/5">
                      <span class="flex gap-2 items-center">
                        <span
                          class="overflow-hidden flex-1 h-1.5 rounded-full bg-n-alpha-2"
                        >
                          <span
                            class="block h-full rounded-full bg-n-brand"
                            :style="{
                              width: `${(a.signed / rankingMax) * 100}%`,
                            }"
                          />
                        </span>
                        <span
                          class="w-8 font-semibold text-right tabular-nums text-n-slate-12"
                        >
                          {{ int(a.signed) }}
                        </span>
                      </span>
                    </td>
                    <td class="py-2.5 text-right tabular-nums text-n-slate-11">
                      {{ pct(a.conversion) }}
                    </td>
                  </tr>
                </tbody>
              </table>
            </DashPanel>

            <DashPanel
              :title="`Tempo em cada etapa${activeBlock ? ' · ' + activeBlock.funnel.title : ''}`"
              subtitle="Dias, em média, entre entrar na etapa e passar para a seguinte"
              icon="i-lucide-hourglass"
            >
              <template v-if="dash.hasHistory.value">
                <div
                  v-if="durationItems.length"
                  class="flex overflow-hidden h-2.5 rounded-full"
                  title="O caminho inteiro, etapa por etapa, proporcional ao tempo médio"
                >
                  <span
                    v-for="d in durationItems"
                    :key="d.key"
                    class="block h-full"
                    :style="{
                      width: `${(d.value / (journeyDays || 1)) * 100}%`,
                      background: d.color,
                    }"
                    :title="`${d.title}: ${dec(d.value)} dias`"
                  />
                </div>
                <DashBars
                  :items="durationItems"
                  empty="Nenhuma passagem de etapa registrada no filtro."
                />
                <p v-if="durationItems.length" :class="NOTE">
                  Somando as médias, o caminho completo leva cerca de
                  <strong class="text-n-slate-12">
                    {{ dec(journeyDays) }} dias
                  </strong>
                  . Só entram leads com as duas datas registradas.
                </p>
              </template>
              <p v-else class="text-sm text-n-slate-11">
                Depende do histórico de etapas, que vem do servidor. Nesta
                carga o painel leu pelo navegador (plano B).
              </p>
            </DashPanel>
          </div>

          <!-- Fechamento -->
          <h2 :class="SECTION">
            Fechamento
            <span class="flex-1 h-px bg-n-weak" />
          </h2>

          <div class="grid gap-4 lg:grid-cols-2 dia-g2">
            <DashPanel
              title="Tempo até o contrato"
              subtitle="Da criação da conversa até a etiqueta de contrato assinado"
              icon="i-lucide-timer"
            >
              <div class="grid grid-cols-3 gap-4 dia-g3">
                <div :class="STAT">
                  <span :class="STAT_LABEL">Média</span>
                  <span :class="STAT_VALUE">
                    {{ dec(dash.closingTime.value.avgDays) }} dias
                  </span>
                </div>
                <div :class="STAT">
                  <span :class="STAT_LABEL">Mediana</span>
                  <span :class="STAT_VALUE">
                    {{ dec(dash.closingTime.value.medianDays) }} dias
                  </span>
                </div>
                <div :class="STAT">
                  <span :class="STAT_LABEL">Contratos</span>
                  <span :class="STAT_VALUE">
                    {{ int(dash.closingTime.value.n) }}
                  </span>
                </div>
              </div>
              <DashColumns :items="closingItems" />
              <p
                v-if="
                  dash.closingTime.value.missing && !dash.signedPending.value
                "
                :class="NOTE"
              >
                {{ int(dash.closingTime.value.missing) }} contrato(s) sem data
                de assinatura ficaram de fora.
              </p>
            </DashPanel>

            <DashPanel
              title="Evolução da meta"
              :subtitle="`Contratos acumulados em ${goalMonth}`"
              icon="i-lucide-trending-up"
            >
              <DashLine :points="goalPoints" :series="GOAL_SERIES" />
            </DashPanel>
          </div>

          <!-- Entrada de leads -->
          <h2 :class="SECTION">
            Entrada de leads
            <span class="flex-1 h-px bg-n-weak" />
            <span :class="SEG_BOX" class="tracking-normal normal-case">
              <button
                v-for="r in CHAT_RANGES"
                :key="r.key"
                :class="[SEG, dash.chatDays.value === r.key ? SEG_ON : SEG_OFF]"
                @click="dash.chatDays.value = r.key"
              >
                {{ r.title }}
              </button>
            </span>
          </h2>

          <DashPanel>
            <div class="grid grid-cols-2 gap-x-8 gap-y-4 md:grid-cols-5 dia-g5">
              <div :class="STAT">
                <span :class="STAT_LABEL">Novos chats</span>
                <span :class="STAT_VALUE">{{ int(dash.chats.value.total) }}</span>
              </div>
              <div :class="STAT">
                <span :class="STAT_LABEL">Média por dia</span>
                <span :class="STAT_VALUE">{{ dec(dash.chats.value.avg) }}</span>
              </div>
              <div :class="STAT">
                <span :class="STAT_LABEL">Dia de pico</span>
                <span :class="STAT_VALUE">
                  {{ int(dash.chats.value.peak.count) }}
                  <span class="text-xs font-normal text-n-slate-10">
                    em {{ ymdToBR(dash.chats.value.peak.ymd) }}
                  </span>
                </span>
              </div>
              <div
                :class="STAT"
                title="Segunda metade do período contra a primeira"
              >
                <span :class="STAT_LABEL">Tendência</span>
                <span
                  :class="[STAT_VALUE, signedClass(dash.chats.value.trend)]"
                >
                  {{ signed(dash.chats.value.trend) }}
                </span>
              </div>
              <div
                :class="STAT"
                :title="`Período anterior de mesmo tamanho: ${int(dash.chats.value.previous)} chats`"
              >
                <span :class="STAT_LABEL">Contra o anterior</span>
                <span
                  :class="[STAT_VALUE, signedClass(dash.chats.value.change)]"
                >
                  {{ signed(dash.chats.value.change) }}
                  <span class="text-xs font-normal text-n-slate-10">
                    (eram {{ int(dash.chats.value.previous) }})
                  </span>
                </span>
              </div>
            </div>
            <DashLine :points="chatPoints" :series="CHAT_SERIES" />
          </DashPanel>

          <div class="grid gap-4 lg:grid-cols-5 dia-g5">
            <DashPanel
              class="lg:col-span-3 dia-s3"
              title="Quando os leads chegam"
              subtitle="Dia da semana × hora da criação da conversa"
              icon="i-lucide-calendar-clock"
            >
              <DashHeat :grid="dash.chats.value.grid" />
            </DashPanel>

            <DashPanel
              class="lg:col-span-2 dia-s2"
              title="Período do dia"
              icon="i-lucide-sun"
            >
              <DashStack :segments="partSegments" />
              <div class="pt-3 border-t border-n-weak">
                <p class="mb-3 text-xs font-semibold text-n-slate-12">
                  Dias de maior volume
                </p>
                <DashBars :items="topDayItems" ranked />
              </div>
            </DashPanel>
          </div>

          <!-- Geografia -->
          <h2 :class="SECTION">
            Geografia
            <span class="flex-1 h-px bg-n-weak" />
            <span :class="SEG_BOX" class="tracking-normal normal-case">
              <button
                :class="[SEG, stateMetric === 'leads' ? SEG_ON : SEG_OFF]"
                @click="stateMetric = 'leads'"
              >
                Leads
              </button>
              <button
                :class="[SEG, stateMetric === 'signed' ? SEG_ON : SEG_OFF]"
                @click="stateMetric = 'signed'"
              >
                Contratos
              </button>
            </span>
          </h2>

          <DashPanel>
            <div class="grid gap-8 items-center lg:grid-cols-2 dia-g2">
              <DashMap
                :values="stateValues"
                :color="ACCENT"
                :unit="stateMetric === 'leads' ? 'leads' : 'contratos'"
              />
              <div class="flex flex-col gap-4">
                <p class="text-xs text-n-slate-10">
                  Estado pelo DDD do telefone ·
                  {{ int(dash.states.value.unknown) }} sem DDD brasileiro
                  identificável
                </p>
                <DashBars :items="stateItems" narrow />
                <button
                  v-if="stateCount > 6"
                  class="flex gap-1.5 justify-center items-center py-2 text-xs rounded-lg transition-colors dia-no-print text-n-slate-11 hover:bg-n-alpha-2"
                  @click="showAllStates = !showAllStates"
                >
                  {{
                    showAllStates
                      ? 'Mostrar só os 6 maiores'
                      : `Ver todos os estados (${stateCount})`
                  }}
                  <span
                    class="i-lucide-chevron-down size-4 transition-transform"
                    :class="showAllStates ? 'rotate-180' : ''"
                  />
                </button>
              </div>
            </div>
          </DashPanel>
        </template>
      </div>
    </div>
  </div>
</template>

<!--
  Impressao / PDF. Sem `scoped` de proposito: precisa alcancar os ancestrais
  da tela (barra lateral, containers com altura fixa) para o painel inteiro
  sair no papel. Tudo fica dentro de @media print e amarrado a .dia-root,
  entao nao afeta nenhuma outra tela do Chatwoot.
-->
<style>
@media print {
  body *:not(:has(.dia-root)):not(.dia-root):not(.dia-root *) {
    display: none !important;
  }

  *:has(.dia-root),
  .dia-root,
  .dia-root .dia-scroll {
    display: block !important;
    position: static !important;
    overflow: visible !important;
    width: auto !important;
    height: auto !important;
    max-height: none !important;
  }

  .dia-root .dia-no-print {
    display: none !important;
  }

  /* Folha em pe (retrato), o padrao de impressoras e leitores de PDF. */
  @page {
    size: A4 portrait;
    margin: 8mm;
  }

  .dia-root {
    zoom: 0.62;
  }

  /*
   * As grades dependem da largura da TELA (lg:, xl:). Na impressao o
   * navegador mede o papel e derrubaria tudo para uma coluna; aqui as
   * colunas sao fixadas na mao.
   */
  .dia-root .dia-g2 {
    grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
  }

  .dia-root .dia-g3 {
    grid-template-columns: repeat(3, minmax(0, 1fr)) !important;
  }

  .dia-root .dia-g5 {
    grid-template-columns: repeat(5, minmax(0, 1fr)) !important;
  }

  .dia-root .dia-s3 {
    grid-column: span 3 / span 3 !important;
  }

  .dia-root .dia-s2,
  .dia-root .dia-span2 {
    grid-column: span 2 / span 2 !important;
  }

  .dia-root section {
    break-inside: avoid;
  }

  .dia-root,
  .dia-root * {
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
}
</style>
