<script setup>
/**
 * Dashboard IA — painel comercial proprio do Chatwoot.
 *
 * Le as mesmas conversas e etiquetas de etapa do Kanban (nada de fora) e
 * mostra: indicadores, funil por etapa, tempo ate o fechamento, meta do mes,
 * novos chats e leads por estado.
 *
 * O que NAO esta aqui, e por que: ranking de anuncios e origem
 * (Facebook/Instagram). O Chatwoot nao guarda de qual anuncio o lead veio —
 * nem na conversa, nem no contato, nem na LEADS PREV. Quando o n8n passar a
 * gravar isso na conversa, o bloco entra em metrics.js como os outros.
 */
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useMapGetter } from 'dashboard/composables/store';
import {
  ALL_FUNNELS_ID,
  CHAT_RANGES,
  COLORS,
  DASH_FUNNELS,
  DATE_MODES,
  GREEN_RAMP,
  PERIODS,
} from './constants';
import { tint } from './chart';
import { ymdToBR } from './metrics';
import { useDashboardIa } from './useDashboardIa';
import DashPanel from './components/DashPanel.vue';
import DashStat from './components/DashStat.vue';
import DashBars from './components/DashBars.vue';
import DashLine from './components/DashLine.vue';
import DashFunnel from './components/DashFunnel.vue';
import DashDonut from './components/DashDonut.vue';

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
// PDF saia como HTML cru, com a barra lateral e sem cores. Enquanto imprime,
// essas folhas passam a valer para "all"; depois voltam ao que eram.
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
  // Dois quadros de folga para o navegador recalcular os estilos antes de
  // abrir a janela de impressao.
  requestAnimationFrame(() => requestAnimationFrame(() => window.print()));
}

onMounted(() => {
  dash.load();
  document.addEventListener('fullscreenchange', syncTv);
  // Cobre tambem o Ctrl+P, que nao passa pelo botao.
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

const currentUser = useMapGetter('getCurrentUser');

const showAllStates = ref(false);
const stateMetric = ref('leads');
const editingGoal = ref(false);
const goalDraft = ref('');
const funnelTab = ref('');

// ------------------------------------------------------------- formatacao

const int = n => Math.round(Number(n) || 0).toLocaleString('pt-BR');
const dec = (n, digits = 1) =>
  (Number(n) || 0).toLocaleString('pt-BR', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
const pct = n => `${dec(n)}%`;

// ----------------------------------------------------------------- classes

const SEG_BOX =
  'flex overflow-hidden p-0.5 gap-0.5 rounded-xl border border-n-weak bg-n-solid-1';
const SEG = 'px-3 py-1.5 text-xs rounded-lg transition-colors whitespace-nowrap';
const SEG_ON = 'bg-[#22c55e] text-white font-semibold shadow-sm';
const SEG_OFF = 'text-n-slate-11 hover:bg-n-alpha-2';
const FILTER_LABEL =
  'text-[10px] font-semibold tracking-wider uppercase text-n-slate-10';
// O `select` global do Chatwoot (assets/scss/_base.scss) e bloco de largura
// total, com 40px de altura e margem embaixo. Os `!` desfazem isso so aqui.
const SELECT =
  '!w-auto !min-w-[11rem] !mb-0 !h-9 !py-0 !text-xs !rounded-xl !bg-n-solid-1';
const DATE = '!w-36 !mb-0 !h-9 !py-0 !text-xs !rounded-xl !bg-n-solid-1';
const MINI =
  'flex flex-col gap-0.5 p-3 rounded-xl border border-n-weak bg-n-solid-1';
const MEDALS = ['#f59e0b', '#94a3b8', '#f97316'];
const INSIGHT =
  'flex gap-3 items-start p-3 text-sm rounded-xl border text-n-slate-11';

// -------------------------------------------------------------- cabecalho

const greeting = computed(() => {
  const h = new Date().getHours();
  const part = h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite';
  const name = (currentUser.value && currentUser.value.name) || '';
  return name ? `${part}, ${name}!` : `${part}!`;
});

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
  const t = new Date(dash.loadedAt.value).toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
  });
  return `Atualizado às ${t}`;
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

// ------------------------------------------------------------- indicadores

const kpiCards = computed(() => {
  const s = dash.summary.value;
  const w = dash.sparks.value;
  return [
    {
      key: 'total',
      label: 'Cards Totais',
      value: int(s.total),
      sub: 'conversas no filtro',
      icon: 'i-lucide-layout-grid',
      color: COLORS.blue,
      values: w.total,
    },
    {
      key: 'signed',
      label: 'Contratos Assinados',
      value: int(s.signed),
      sub: 'em contrato assinado ou além',
      hint: 'Conversas que hoje estão na etapa Contrato assinado ou em qualquer etapa depois dela',
      icon: 'i-lucide-trophy',
      color: COLORS.greenDark,
      accent: true,
      values: w.signed,
    },
    {
      key: 'conversion',
      label: 'Taxa de Conversão',
      value: pct(s.conversion),
      sub: 'Total → Assinado',
      icon: 'i-lucide-trending-up',
      color: COLORS.purple,
      values: w.conversion,
    },
    {
      key: 'efficiency',
      label: 'Taxa de Eficiência',
      value: pct(s.efficiency),
      sub: 'Assinados / Qualificados',
      hint: 'Dos leads que passaram da triagem, quantos assinaram',
      icon: 'i-lucide-target',
      color: COLORS.cyan,
      values: w.efficiency,
    },
    {
      key: 'qualified',
      label: '% Lead Qualificado',
      value: pct(s.qualifiedPct),
      sub: `${int(s.qualified)} qualificados`,
      hint: 'Conta quem está HOJE da etapa de qualificado em diante. Lead que qualificou e depois foi descartado aparece como descartado.',
      icon: 'i-lucide-user-check',
      color: COLORS.amber,
      values: w.qualifiedPct,
    },
  ];
});

// ------------------------------------------------------------------ funil

// Icone por etapa. Etapa sem icone aqui usa o ponto generico.
const STAGE_ICONS = {
  sdr: 'i-lucide-users',
  comercial: 'i-lucide-briefcase',
  contrato_em_elaboracao: 'i-lucide-file-text',
  aguardando_assinatura: 'i-lucide-pen-line',
  contrato_assinado: 'i-lucide-trophy',
  analise_medica: 'i-lucide-stethoscope',
  analise_juridica: 'i-lucide-scale',
  efetivado: 'i-lucide-party-popper',
  bpc_lead_novo: 'i-lucide-user-plus',
  bpc_lead_novo_especial: 'i-lucide-star',
  bpc_aguardando_requisito: 'i-lucide-clipboard-list',
  bpc_qualificado: 'i-lucide-briefcase',
  bpc_documentos_iniciais: 'i-lucide-paperclip',
  bpc_aguardando_assinatura: 'i-lucide-pen-line',
  bpc_contrato_assinado: 'i-lucide-trophy',
  bpc_pegar_senha: 'i-lucide-key-round',
  bpc_analise_medica: 'i-lucide-stethoscope',
  bpc_analise_juridica: 'i-lucide-scale',
  bpc_pos_juridica: 'i-lucide-hourglass',
  bpc_efetivado: 'i-lucide-party-popper',
  trab_apresentacao: 'i-lucide-hand',
  trab_qualificacao: 'i-lucide-users',
  trab_coleta_info: 'i-lucide-search',
  trab_explicacao_processo: 'i-lucide-scale',
  trab_condicoes_financeiras: 'i-lucide-banknote',
  trab_objecao: 'i-lucide-message-circle-question',
  trab_fechamento: 'i-lucide-handshake',
  trab_coleta_contrato: 'i-lucide-file-text',
  trab_contrato_enviado: 'i-lucide-send',
};

// Com "Todos os funis" o painel mostra um funil por vez, escolhido nas abas.
const activeBlock = computed(() => {
  const blocks = dash.byFunnel.value;
  return blocks.find(b => b.funnel.id === funnelTab.value) || blocks[0] || null;
});

const funnelSteps = computed(() => {
  const b = activeBlock.value;
  if (!b) return [];
  const colors = new Map(b.funnel.columns.map(c => [c.label, c.color]));
  return b.steps.steps.map(s => ({
    ...s,
    color: colors.get(s.label) || COLORS.slate,
    icon: STAGE_ICONS[s.label] || 'i-lucide-circle-dot',
  }));
});

const funnelConversion = computed(() => {
  const b = activeBlock.value;
  if (!b || !b.funnel.signedFrom) return null;
  const step = b.steps.steps.find(s => s.label === b.funnel.signedFrom);
  return {
    signed: step ? step.reached : 0,
    total: b.steps.total,
    pct: b.steps.total ? ((step ? step.reached : 0) / b.steps.total) * 100 : 0,
  };
});

const stageChips = computed(() => (activeBlock.value || { stages: [] }).stages);

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

const rankingMax = computed(() =>
  Math.max(1, ...dash.ranking.value.map(a => a.signed))
);

const offStages = computed(() =>
  stageChips.value
    .filter(s => s.kind !== 'path')
    .map(s => ({
      key: s.label,
      title: s.title,
      value: s.count,
      note: pct(s.pct),
      color: s.color,
    }))
);

// ------------------------------------------------- fechamento, meta, chats

const closingSegments = computed(() =>
  dash.closingTime.value.buckets.map((b, i) => ({
    key: b.key,
    title: b.title,
    value: b.count,
    color: GREEN_RAMP[i],
  }))
);

const closingInsight = computed(() => {
  const c = dash.closingTime.value;
  if (!c.n) return '';
  const fast = c.buckets.slice(0, 2).reduce((a, b) => a + b.count, 0);
  return `${pct((fast / c.n) * 100)} dos contratos fecham em até 2 dias; a metade fecha em até ${dec(c.medianDays)} dias.`;
});

const goalMonth = computed(() => {
  const m = dash.goalData.value.month;
  return `${m.slice(5, 7)}/${m.slice(0, 4)}`;
});

const goalPoints = computed(() =>
  dash.goalData.value.series.map(s => ({
    label: `${String(s.day).padStart(2, '0')}/${dash.goalData.value.month.slice(5, 7)}`,
    done: s.done,
    projection: s.projection,
    target: s.target,
  }))
);

const GOAL_SERIES = [
  { key: 'done', label: 'Realizado', color: COLORS.greenDark, kind: 'area' },
  { key: 'projection', label: 'Projeção', color: '#86efac', kind: 'line' },
  { key: 'target', label: 'Meta', color: COLORS.slate, kind: 'dashed' },
];

const goalTicks = computed(() => {
  const g = dash.goalData.value.goal;
  return [0, 0.25, 0.5, 0.75, 1].map(f => Math.round(g * f));
});

const goalMarker = computed(() =>
  Math.min(Math.max(dash.goalData.value.donePct, 0), 100)
);

const goalScope = computed(() =>
  dash.funnelId.value === ALL_FUNNELS_ID
    ? 'geral'
    : (DASH_FUNNELS.find(f => f.id === dash.funnelId.value) || {}).title || ''
);

const goalInsight = computed(() => {
  const g = dash.goalData.value;
  if (!g.goal) return '';
  if (g.projectionPct >= 100)
    return `No ritmo atual, a projeção passa da meta: ${int(g.projection)} contratos (${pct(g.projectionPct)}).`;
  return `No ritmo atual, o mês fecha em ${int(g.projection)} contratos — ${pct(g.projectionPct)} da meta.`;
});

const chatPoints = computed(() =>
  dash.chats.value.series.map(s => ({
    label: ymdToBR(s.ymd),
    count: s.count,
    avg: s.avg,
  }))
);

const CHAT_SERIES = [
  { key: 'count', label: 'Novos chats', color: COLORS.green, kind: 'area' },
  {
    key: 'avg',
    label: 'Média móvel (7 dias)',
    color: COLORS.slate,
    kind: 'dashed',
  },
];

const trendOf = n => {
  if (n === null) return { text: '—', color: '', icon: 'i-lucide-minus' };
  return n >= 0
    ? {
        text: `${dec(n, 0)}%`,
        color: COLORS.greenDark,
        icon: 'i-lucide-arrow-up-right',
      }
    : {
        text: `${dec(Math.abs(n), 0)}%`,
        color: COLORS.red,
        icon: 'i-lucide-arrow-down-right',
      };
};

const chatTrend = computed(() => trendOf(dash.chats.value.trend));
const chatChange = computed(() => trendOf(dash.chats.value.change));

const chatCards = computed(() => {
  const c = dash.chats.value;
  return [
    {
      key: 'total',
      label: 'Total de chats',
      value: int(c.total),
      sub: `nos últimos ${c.days} dias`,
      icon: 'i-lucide-message-square',
      color: COLORS.greenDark,
    },
    {
      key: 'avg',
      label: 'Média por dia',
      value: dec(c.avg),
      sub: 'chats/dia',
      icon: 'i-lucide-calendar-days',
      color: COLORS.blue,
    },
    {
      key: 'peak',
      label: 'Pico de volume',
      value: int(c.peak.count),
      sub: ymdToBR(c.peak.ymd),
      icon: 'i-lucide-flame',
      color: COLORS.orange,
    },
  ];
});

const PART_STYLE = {
  manha: { color: COLORS.amber, icon: 'i-lucide-sun' },
  tarde: { color: COLORS.green, icon: 'i-lucide-sunset' },
  noite: { color: COLORS.indigo, icon: 'i-lucide-moon' },
  madrugada: { color: COLORS.slate, icon: 'i-lucide-clock' },
};

const partSegments = computed(() =>
  dash.chats.value.parts.map(p => ({
    key: p.key,
    title: p.title,
    value: p.count,
    ...PART_STYLE[p.key],
  }))
);

const partInsight = computed(() => {
  const parts = dash.chats.value.parts;
  if (!dash.chats.value.total) return '';
  const top = parts.reduce((a, p) => (p.count > a.count ? p : a), parts[0]);
  return `O período da ${top.title.toLowerCase()} concentra ${pct(top.pct)} dos novos chats — melhor janela para reforçar o atendimento.`;
});

const hourMax = computed(() =>
  Math.max(1, ...dash.chats.value.hours.map(h => h.count))
);

// Intensidade por horario: um verde so, do claro ao escuro.
const hourCell = h => {
  const ratio = h.count / hourMax.value;
  return {
    background: tint(COLORS.green, h.count ? 14 + ratio * 86 : 6),
    color: ratio > 0.55 ? '#fff' : null,
  };
};

const compareBars = computed(() => {
  const c = dash.chats.value;
  const max = Math.max(c.total, c.previous, 1);
  return {
    current: (c.total / max) * 100,
    previous: (c.previous / max) * 100,
  };
});

const topDayItems = computed(() =>
  dash.chats.value.top.map(d => ({
    key: d.ymd,
    title: ymdToBR(d.ymd),
    value: d.count,
    note: pct(d.pct),
  }))
);

// ---------------------------------------------------------------- estados

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
  return showAllStates.value ? items : items.slice(0, 5);
});

const stateCount = computed(
  () => dash.states.value.list.filter(s => s[stateMetric.value] > 0).length
);

function startGoalEdit() {
  goalDraft.value = dash.goal.value ? String(dash.goal.value) : '';
  editingGoal.value = true;
}

function saveGoal() {
  dash.setGoal(goalDraft.value);
  editingGoal.value = false;
}
</script>

<template>
  <div
    ref="rootEl"
    class="flex flex-col w-full h-full dia-root bg-n-background"
  >
    <div class="overflow-y-auto flex-1 dia-scroll">
      <div class="flex flex-col gap-5 p-6 mx-auto max-w-[1480px]">
        <!-- Saudacao -->
        <header class="flex flex-wrap gap-3 justify-between items-start">
          <div>
            <div class="flex gap-2 items-center">
              <h1 class="text-2xl font-bold tracking-tight text-n-slate-12">
                {{ greeting }} 👋
              </h1>
            </div>
            <p class="mt-1 text-sm text-n-slate-11">
              Aqui está o desempenho comercial · {{ periodTitle }}
            </p>
          </div>
          <div class="flex gap-2 items-center">
            <span
              v-if="dash.signedPending.value"
              class="text-xs text-n-slate-11"
              title="A data de cada contrato sai do histórico da conversa"
            >
              Lendo datas de assinatura: faltam {{ dash.signedPending.value }}
            </span>
            <button
              class="flex gap-2 items-center px-3 py-1.5 text-xs rounded-full border shadow-sm transition-colors dia-no-print border-n-weak bg-n-solid-1 text-n-slate-11 hover:bg-n-alpha-2"
              title="Gerar PDF do painel (use “Salvar como PDF” na janela de impressão)"
              @click="printPdf"
            >
              <span class="i-lucide-file-down size-3.5" />
              PDF
            </button>
            <button
              class="flex gap-2 items-center px-3 py-1.5 text-xs rounded-full border shadow-sm transition-colors dia-no-print border-n-weak bg-n-solid-1 text-n-slate-11 hover:bg-n-alpha-2"
              title="Tela cheia, com atualização automática a cada 5 minutos"
              @click="toggleTv"
            >
              <span class="i-lucide-tv size-3.5" />
              {{ tvMode ? 'Sair do Modo TV' : 'Modo TV' }}
            </button>
            <button
              class="flex gap-2 items-center px-3 py-1.5 text-xs rounded-full border shadow-sm transition-colors border-n-weak bg-n-solid-1 text-n-slate-11 hover:bg-n-alpha-2 disabled:opacity-60"
              :disabled="dash.loading.value || dash.refreshing.value"
              :title="sourceHint"
              @click="dash.load({ force: true })"
            >
              <span
                class="rounded-full size-2"
                :style="{
                  background:
                    dash.source.value === 'navegador'
                      ? COLORS.amber
                      : COLORS.green,
                }"
              />
              {{ updatedText || 'Atualizar' }}
              <span
                class="i-lucide-refresh-cw size-3.5 dia-no-print"
                :class="
                  dash.loading.value || dash.refreshing.value
                    ? 'animate-spin'
                    : ''
                "
              />
            </button>
          </div>
        </header>

        <!-- Filtros -->
        <div
          v-show="!tvMode"
          class="flex flex-wrap gap-x-5 gap-y-3 items-end pb-5 border-b dia-no-print border-n-weak"
        >
          <div class="flex flex-col gap-1.5">
            <span :class="FILTER_LABEL">Período</span>
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
          </div>

          <div
            v-if="dash.period.value === 'custom'"
            class="flex flex-col gap-1.5"
          >
            <span :class="FILTER_LABEL">De · até</span>
            <div class="flex gap-1.5 items-center">
              <input
                v-model="dash.customFrom.value"
                type="date"
                aria-label="Data inicial"
                :class="DATE"
              />
              <input
                v-model="dash.customTo.value"
                type="date"
                aria-label="Data final"
                :class="DATE"
              />
            </div>
          </div>

          <div
            class="flex flex-col gap-1.5"
            title="Qual data da conversa o período olha: quando foi criada ou quando teve a última atividade"
          >
            <span :class="FILTER_LABEL">Modo</span>
            <div :class="SEG_BOX">
              <button
                v-for="m in DATE_MODES"
                :key="m.key"
                :class="[SEG, dash.mode.value === m.key ? SEG_ON : SEG_OFF]"
                @click="dash.mode.value = m.key"
              >
                {{ m.title }}
              </button>
            </div>
          </div>

          <label class="flex flex-col gap-1.5">
            <span :class="FILTER_LABEL">Funil</span>
            <select
              :class="SELECT"
              :value="dash.funnelId.value"
              @change="dash.setFunnel($event.target.value)"
            >
              <option v-for="f in funnelOptions" :key="f.id" :value="f.id">
                {{ f.title }}
              </option>
            </select>
          </label>

          <label class="flex flex-col gap-1.5">
            <span :class="FILTER_LABEL">Responsável</span>
            <select
              :class="SELECT"
              :value="
                dash.assigneeId.value === null ? '' : dash.assigneeId.value
              "
              @change="
                dash.assigneeId.value =
                  $event.target.value === ''
                    ? null
                    : Number($event.target.value)
              "
            >
              <option value="">Todos os responsáveis</option>
              <option
                v-for="a in dash.assignees.value"
                :key="a.id"
                :value="a.id"
              >
                {{ a.name }} ({{ int(a.count) }})
              </option>
            </select>
          </label>
        </div>

        <!-- Carregando / erro -->
        <div
          v-if="dash.loading.value"
          class="flex flex-col gap-3 justify-center items-center h-72 rounded-2xl border border-n-weak bg-n-solid-1"
        >
          <span class="i-lucide-loader-circle size-6 animate-spin text-[#22c55e]" />
          <span class="text-sm text-n-slate-11">
            Lendo conversas… {{ int(dash.progress.fetched) }}
            <template v-if="dash.progress.total">
              de {{ int(dash.progress.total) }}
            </template>
          </span>
          <span class="overflow-hidden w-72 h-1.5 rounded-full bg-n-alpha-2">
            <span
              class="block h-full rounded-full transition-all bg-[#22c55e]"
              :style="{ width: `${progressPct}%` }"
            />
          </span>
        </div>

        <div
          v-else-if="dash.error.value"
          class="flex flex-col gap-2 justify-center items-center h-72 rounded-2xl border border-n-weak bg-n-solid-1"
        >
          <span class="text-sm font-semibold text-n-slate-12">
            Não deu para montar o painel.
          </span>
          <span class="text-xs text-n-slate-11">{{ dash.error.value }}</span>
          <button
            class="px-3 py-1.5 mt-1 text-xs font-semibold text-white rounded-lg bg-[#22c55e] hover:opacity-90"
            @click="dash.load({ force: true })"
          >
            Tentar de novo
          </button>
        </div>

        <template v-else>
          <!-- Indicadores -->
          <div class="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-5 dia-g5">
            <DashStat v-for="k in kpiCards" :key="k.key" v-bind="k" />
          </div>

          <!-- Abas de funil -->
          <div
            v-if="dash.byFunnel.value.length > 1"
            class="flex gap-2 items-center"
          >
            <span :class="FILTER_LABEL">Funil em detalhe</span>
            <div :class="SEG_BOX">
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
                {{ b.funnel.title }} · {{ int(b.steps.total) }}
              </button>
            </div>
          </div>

          <template v-if="activeBlock">
            <!-- Etapas -->
            <div
              class="grid gap-3 grid-cols-[repeat(auto-fill,minmax(8.5rem,1fr))]"
            >
              <button
                v-for="s in stageChips"
                :key="s.label"
                type="button"
                class="flex flex-col gap-1 p-3 min-w-0 text-left rounded-xl border transition-shadow border-n-weak bg-n-solid-1 hover:shadow-md"
                :style="{
                  backgroundImage: `linear-gradient(160deg, ${tint(s.color, 10)}, transparent 60%)`,
                }"
                :title="`${s.title}: ${int(s.count)} (${pct(s.pct)} do funil) — clique para ver as conversas`"
                @click="openStage(s.label)"
              >
                <span class="flex gap-1.5 items-center min-w-0">
                  <span
                    class="flex-shrink-0 rounded-full size-2"
                    :style="{ background: s.color }"
                  />
                  <span class="text-xs font-medium truncate text-n-slate-11">
                    {{ s.title }}
                  </span>
                </span>
                <span
                  class="text-xl font-bold tabular-nums text-n-slate-12"
                  :style="
                    s.label === activeBlock.funnel.signedFrom
                      ? { color: COLORS.greenDark }
                      : null
                  "
                >
                  {{ int(s.count) }}
                </span>
                <span class="text-[11px] text-n-slate-10">
                  {{ pct(s.pct) }} do total
                </span>
              </button>
            </div>

            <div class="grid gap-5 xl:grid-cols-5 dia-g5">
              <!-- Funil -->
              <DashPanel
                class="xl:col-span-3 dia-s3"
                :title="`Funil de Vendas · ${activeBlock.funnel.title}`"
                subtitle="Quantos leads estão em cada etapa ou além dela"
              >
                <template #actions>
                  <span
                    class="px-3 py-1 text-xs rounded-full bg-n-alpha-2 text-n-slate-11"
                  >
                    Total
                    <span class="ml-1 font-bold tabular-nums text-n-slate-12">
                      {{ int(activeBlock.steps.total) }}
                    </span>
                  </span>
                </template>

                <DashFunnel :steps="funnelSteps" @select="openStage" />

                <div
                  v-if="funnelConversion"
                  class="flex gap-2 justify-center items-center p-3 text-sm rounded-xl border border-n-weak bg-n-alpha-1 text-n-slate-11"
                >
                  <span
                    class="flex justify-center items-center rounded-lg size-7"
                    :style="{
                      background: tint(COLORS.green, 16),
                      color: COLORS.greenDark,
                    }"
                  >
                    <span class="i-lucide-trophy size-3.5" />
                  </span>
                  Conversão geral
                  <span
                    class="font-bold tabular-nums"
                    :style="{ color: COLORS.greenDark }"
                  >
                    {{ pct(funnelConversion.pct) }}
                  </span>
                  <span class="text-xs tabular-nums text-n-slate-10">
                    ({{ int(funnelConversion.signed) }} de
                    {{ int(funnelConversion.total) }})
                  </span>
                </div>
                <p v-else class="text-xs text-center text-n-slate-10">
                  Este funil termina em “Contrato enviado” e não tem etapa de
                  contrato assinado.
                </p>
              </DashPanel>

              <!-- Fora do funil -->
              <DashPanel
                class="xl:col-span-2 dia-s2"
                title="Fora do funil"
                :subtitle="`${int(activeBlock.steps.off)} conversas descartadas, em espera ou sem etapa`"
                icon="i-lucide-filter-x"
                :color="COLORS.red"
              >
                <DashBars
                  :items="offStages"
                  empty="Nenhuma conversa fora do funil."
                />
                <div
                  :class="INSIGHT"
                  class="mt-auto"
                  :style="{
                    background: tint(COLORS.purple, 6),
                    borderColor: tint(COLORS.purple, 22),
                  }"
                >
                  <span
                    class="flex-shrink-0 i-lucide-sparkles size-4 mt-0.5"
                    :style="{ color: COLORS.purple }"
                  />
                  <span>
                    <strong class="text-n-slate-12">
                      {{ pct(dash.summary.value.lostPct) }}
                    </strong>
                    das conversas do filtro foram descartadas. Lead que
                    qualificou e depois foi descartado conta só aqui.
                  </span>
                </div>
              </DashPanel>
            </div>
          </template>

          <!-- Motivos de descarte -->
          <DashPanel
            v-if="dash.showLossReasons.value"
            title="Por que Perdemos · Auxílio Acidente"
            :subtitle="`Motivo registrado nos ${int(dash.lossReasons.value.total)} leads desqualificados · base inteira, sem filtro de período`"
            icon="i-lucide-circle-help"
            :color="COLORS.red"
          >
            <DashBars :items="lossItems" :color="COLORS.red" wide />
          </DashPanel>

          <div class="grid gap-5 lg:grid-cols-2 dia-g2">
            <!-- Ranking -->
            <DashPanel
              title="Ranking por Responsável"
              subtitle="Quem tem a conversa atribuída hoje · ordenado por contratos"
              icon="i-lucide-medal"
              :color="COLORS.amber"
            >
              <table class="w-full text-sm">
                <thead>
                  <tr class="text-[10px] tracking-wider uppercase text-n-slate-10">
                    <th class="pb-2 font-semibold text-left">Responsável</th>
                    <th class="pb-2 font-semibold text-right">Leads</th>
                    <th class="pb-2 font-semibold text-right">Qualif.</th>
                    <th class="pb-2 pl-4 font-semibold text-left">Contratos</th>
                    <th class="pb-2 font-semibold text-right">Conversão</th>
                  </tr>
                </thead>
                <tbody>
                  <tr
                    v-for="(a, i) in dash.ranking.value"
                    :key="a.id"
                    class="border-t border-n-weak"
                  >
                    <td class="py-2">
                      <span class="flex gap-2 items-center min-w-0">
                        <span
                          class="flex flex-shrink-0 justify-center items-center text-xs font-bold rounded-full size-6"
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
                    <td class="py-2 text-right tabular-nums text-n-slate-12">
                      {{ int(a.total) }}
                    </td>
                    <td class="py-2 text-right tabular-nums text-n-slate-12">
                      {{ int(a.qualified) }}
                    </td>
                    <td class="py-2 pl-4 w-2/5">
                      <span class="flex gap-2 items-center">
                        <span
                          class="overflow-hidden flex-1 h-2 rounded-full bg-n-alpha-2"
                        >
                          <span
                            class="block h-full rounded-full"
                            :style="{
                              width: `${(a.signed / rankingMax) * 100}%`,
                              background: COLORS.green,
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
                    <td class="py-2 text-right tabular-nums text-n-slate-11">
                      {{ pct(a.conversion) }}
                    </td>
                  </tr>
                </tbody>
              </table>
            </DashPanel>

            <!-- Tempo por etapa -->
            <DashPanel
              :title="`Tempo Médio em Cada Etapa${activeBlock ? ' · ' + activeBlock.funnel.title : ''}`"
              subtitle="Dias entre entrar na etapa e passar para a seguinte, pelo histórico de etiquetas"
              icon="i-lucide-hourglass"
              :color="COLORS.indigo"
            >
              <DashBars
                v-if="dash.hasHistory.value"
                :items="durationItems"
                empty="Nenhuma passagem de etapa registrada no filtro."
              />
              <p v-else class="text-sm text-n-slate-11">
                Este bloco depende do histórico de etapas, que vem do servidor.
                Nesta carga o painel leu pelo navegador (plano B).
              </p>
              <p
                v-if="dash.hasHistory.value && durationItems.length"
                class="mt-auto text-xs text-n-slate-10"
              >
                Valores em dias. Só entram leads com a data das duas etapas
                registrada; etapa sem passagem registrada não aparece.
              </p>
            </DashPanel>
          </div>

          <div class="grid gap-5 lg:grid-cols-2 dia-g2">
            <!-- Tempo ate fechamento -->
            <DashPanel
              title="Tempo Médio até Fechamento"
              subtitle="Quanto tempo leva da entrada até o contrato"
              icon="i-lucide-clock"
              :color="COLORS.greenDark"
            >
              <div class="flex flex-wrap gap-x-6 gap-y-2 items-end">
                <div>
                  <span
                    class="text-5xl font-bold tracking-tight tabular-nums"
                    :style="{ color: COLORS.greenDark }"
                  >
                    {{ dec(dash.closingTime.value.avgDays) }}
                  </span>
                  <span class="ml-2 text-lg text-n-slate-11">dias</span>
                </div>
              </div>
              <div class="flex flex-wrap gap-3 items-center">
                <span
                  class="flex gap-2 items-center px-3 py-1.5 text-sm font-semibold rounded-lg border tabular-nums border-n-weak text-n-slate-12"
                >
                  <span class="i-lucide-clock size-3.5 text-n-slate-10" />
                  {{ dec(dash.closingTime.value.avgHours) }} horas
                </span>
                <span class="text-xs text-n-slate-11">
                  Baseado em {{ int(dash.closingTime.value.n) }} contratos
                  fechados
                </span>
              </div>

              <div class="p-4 rounded-xl border border-n-weak">
                <h3 class="mb-4 text-sm font-semibold text-n-slate-12">
                  Distribuição do tempo até fechamento
                </h3>
                <DashDonut
                  :segments="closingSegments"
                  :center-value="int(dash.closingTime.value.n)"
                  center-label="contratos"
                />
              </div>

              <div
                v-if="closingInsight"
                :class="INSIGHT"
                :style="{
                  background: tint(COLORS.green, 6),
                  borderColor: tint(COLORS.green, 24),
                }"
              >
                <span
                  class="flex-shrink-0 i-lucide-sparkles size-4 mt-0.5"
                  :style="{ color: COLORS.greenDark }"
                />
                <span>{{ closingInsight }}</span>
              </div>
              <p
                v-if="
                  dash.closingTime.value.missing && !dash.signedPending.value
                "
                class="text-xs text-n-slate-10"
              >
                {{ int(dash.closingTime.value.missing) }} contrato(s) ficaram
                de fora: o histórico da conversa não registra quando a
                etiqueta de contrato assinado foi aplicada.
              </p>
            </DashPanel>

            <!-- Meta -->
            <DashPanel
              title="Meta de Vendas"
              :subtitle="`Meta ${goalScope} · contratos assinados em ${goalMonth}, pela data da assinatura`"
              icon="i-lucide-target"
              :color="COLORS.greenDark"
            >
              <template #actions>
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
                    class="px-2.5 h-8 text-xs font-semibold text-white rounded-lg bg-[#22c55e]"
                  >
                    Salvar
                  </button>
                </form>
                <button
                  v-else
                  class="flex justify-center items-center rounded-lg size-8 text-n-slate-11 hover:bg-n-alpha-2"
                  :title="
                    dash.hasHistory.value
                      ? `Alterar a meta ${goalScope} (vale para todos)`
                      : `Alterar a meta ${goalScope} (fica só neste navegador)`
                  "
                  aria-label="Alterar a meta"
                  @click="startGoalEdit"
                >
                  <span class="i-lucide-pencil size-4" />
                </button>
              </template>

              <p v-if="dash.goalError.value" class="text-xs text-n-ruby-11">
                {{ dash.goalError.value }}
              </p>
              <div class="flex flex-wrap gap-3 justify-between items-end">
                <div>
                  <div
                    class="text-5xl font-bold tracking-tight tabular-nums text-n-slate-12"
                  >
                    {{ int(dash.goalData.value.done) }}
                  </div>
                  <div class="text-sm text-n-slate-11">contratos fechados</div>
                </div>
                <button
                  v-if="!dash.goalData.value.goal"
                  class="px-3 py-1.5 text-xs font-semibold text-white rounded-lg dia-no-print bg-[#22c55e] hover:opacity-90"
                  @click="startGoalEdit"
                >
                  Definir meta deste funil
                </button>
                <div v-else class="flex flex-col gap-1 items-end">
                  <span class="text-sm text-n-slate-11">
                    de {{ int(dash.goalData.value.goal) }} contratos
                  </span>
                  <span
                    class="px-2.5 py-0.5 text-xs font-semibold rounded-full"
                    :style="{
                      background: tint(COLORS.green, 16),
                      color: COLORS.greenDark,
                    }"
                  >
                    {{ pct(dash.goalData.value.donePct) }} da meta
                  </span>
                </div>
              </div>

              <div v-if="dash.goalData.value.goal" class="pt-5">
                <div
                  class="relative h-2.5 rounded-full"
                  :style="{ background: tint(COLORS.green, 16) }"
                >
                  <span
                    class="block h-full rounded-full"
                    :style="{
                      width: `${goalMarker}%`,
                      background: COLORS.green,
                    }"
                  />
                  <span
                    class="absolute bottom-full px-1.5 mb-1 text-xs font-bold text-white rounded-md -translate-x-1/2 tabular-nums"
                    :style="{
                      left: `${goalMarker}%`,
                      background: COLORS.greenDark,
                    }"
                  >
                    {{ int(dash.goalData.value.done) }}
                  </span>
                </div>
                <div
                  class="flex justify-between mt-1.5 text-[10.5px] tabular-nums text-n-slate-10"
                >
                  <span v-for="t in goalTicks" :key="t">{{ int(t) }}</span>
                </div>
              </div>

              <div class="grid grid-cols-2 gap-3 sm:grid-cols-4 dia-g4">
                <div :class="MINI">
                  <span class="flex gap-1.5 items-center text-xs text-n-slate-11">
                    <span
                      class="i-lucide-flag size-3.5"
                      :style="{ color: COLORS.greenDark }"
                    />
                    Faltam
                  </span>
                  <span class="text-xl font-bold tabular-nums text-n-slate-12">
                    {{ int(dash.goalData.value.left) }}
                  </span>
                  <span class="text-[11px] text-n-slate-10">
                    para bater a meta
                  </span>
                </div>
                <div :class="MINI">
                  <span class="flex gap-1.5 items-center text-xs text-n-slate-11">
                    <span
                      class="i-lucide-calendar-range size-3.5"
                      :style="{ color: COLORS.amber }"
                    />
                    Projeção do mês
                  </span>
                  <span class="text-xl font-bold tabular-nums text-n-slate-12">
                    {{ int(dash.goalData.value.projection) }}
                  </span>
                  <span class="text-[11px] text-n-slate-10">
                    {{ pct(dash.goalData.value.projectionPct) }} da meta
                  </span>
                </div>
                <div :class="MINI">
                  <span class="flex gap-1.5 items-center text-xs text-n-slate-11">
                    <span
                      class="i-lucide-gauge size-3.5"
                      :style="{ color: COLORS.blue }"
                    />
                    Média diária
                  </span>
                  <span class="text-xl font-bold tabular-nums text-n-slate-12">
                    {{ dec(dash.goalData.value.neededPerDay, 2) }}
                  </span>
                  <span class="text-[11px] text-n-slate-10">
                    necessária até o fim do mês
                  </span>
                </div>
                <div :class="MINI">
                  <span class="flex gap-1.5 items-center text-xs text-n-slate-11">
                    <span
                      class="i-lucide-sparkles size-3.5"
                      :style="{ color: COLORS.purple }"
                    />
                    Melhor dia
                  </span>
                  <span class="text-xl font-bold tabular-nums text-n-slate-12">
                    {{
                      dash.goalData.value.bestDay
                        ? int(dash.goalData.value.bestDay.count)
                        : '—'
                    }}
                  </span>
                  <span class="text-[11px] text-n-slate-10">
                    <template v-if="dash.goalData.value.bestDay">
                      em
                      {{
                        String(dash.goalData.value.bestDay.day).padStart(2, '0')
                      }}/{{ goalMonth.slice(0, 2) }}
                    </template>
                    <template v-else>sem contrato no mês</template>
                  </span>
                </div>
              </div>

              <div class="p-4 rounded-xl border border-n-weak">
                <h3 class="text-sm font-semibold text-n-slate-12">
                  Evolução da meta
                </h3>
                <DashLine :points="goalPoints" :series="GOAL_SERIES" />
              </div>

              <div
                v-if="goalInsight"
                :class="INSIGHT"
                :style="{
                  background: tint(COLORS.green, 6),
                  borderColor: tint(COLORS.green, 24),
                }"
              >
                <span
                  class="flex-shrink-0 i-lucide-trending-up size-4 mt-0.5"
                  :style="{ color: COLORS.greenDark }"
                />
                <span>{{ goalInsight }}</span>
              </div>
              <p
                v-if="dash.goalData.value.missing && !dash.signedPending.value"
                class="text-xs text-n-slate-10"
              >
                {{ int(dash.goalData.value.missing) }} contrato(s) sem data de
                assinatura localizada não entram nesta conta.
              </p>
            </DashPanel>
          </div>

          <!-- Novos chats -->
          <div class="flex flex-wrap gap-3 justify-between items-center pt-2">
            <div class="flex gap-3 items-center">
              <span
                class="flex justify-center items-center rounded-xl size-11"
                :style="{
                  background: tint(COLORS.green, 14),
                  color: COLORS.greenDark,
                }"
              >
                <span class="i-lucide-activity size-5" />
              </span>
              <div>
                <h2 class="text-xl font-bold tracking-tight text-n-slate-12">
                  Evolução de Novos Chats
                </h2>
                <p class="text-sm text-n-slate-11">
                  Conversas criadas por dia, no funil e responsável escolhidos
                </p>
              </div>
            </div>
            <div :class="SEG_BOX">
              <button
                v-for="r in CHAT_RANGES"
                :key="r.key"
                :class="[SEG, dash.chatDays.value === r.key ? SEG_ON : SEG_OFF]"
                @click="dash.chatDays.value = r.key"
              >
                {{ r.title }}
              </button>
            </div>
          </div>

          <div class="grid grid-cols-2 gap-4 lg:grid-cols-4 dia-g4">
            <div
              v-for="c in chatCards"
              :key="c.key"
              class="flex flex-col gap-1 p-4 rounded-2xl border shadow-sm border-n-weak bg-n-solid-1"
              :style="{
                backgroundImage: `linear-gradient(200deg, ${tint(c.color, 9)}, transparent 50%)`,
              }"
            >
              <span class="flex justify-between items-center">
                <span class="text-xs font-semibold text-n-slate-11">
                  {{ c.label }}
                </span>
                <span class="size-4" :class="c.icon" :style="{ color: c.color }" />
              </span>
              <span
                class="text-3xl font-bold tracking-tight tabular-nums"
                :style="{ color: c.color }"
              >
                {{ c.value }}
              </span>
              <span class="text-xs text-n-slate-10">{{ c.sub }}</span>
            </div>
            <div
              class="flex flex-col gap-1 p-4 rounded-2xl border shadow-sm border-n-weak bg-n-solid-1"
              title="Segunda metade do período contra a primeira"
            >
              <span class="flex justify-between items-center">
                <span class="text-xs font-semibold text-n-slate-11">
                  Tendência
                </span>
                <span
                  class="i-lucide-trending-up size-4"
                  :style="{ color: chatTrend.color }"
                />
              </span>
              <span
                class="flex gap-1 items-center text-3xl font-bold tracking-tight tabular-nums text-n-slate-12"
                :style="chatTrend.color ? { color: chatTrend.color } : null"
              >
                <span class="size-6" :class="chatTrend.icon" />
                {{ chatTrend.text }}
              </span>
              <span class="text-xs text-n-slate-10">
                {{
                  dash.chats.value.trend === null
                    ? 'sem base de comparação'
                    : dash.chats.value.trend >= 0
                      ? 'crescendo'
                      : 'caindo'
                }}
              </span>
            </div>
          </div>

          <DashPanel
            title="Evolução de novos chats"
            subtitle="Por dia · linha tracejada = média móvel"
            icon="i-lucide-activity"
            :color="COLORS.greenDark"
          >
            <DashLine :points="chatPoints" :series="CHAT_SERIES" />
          </DashPanel>

          <div class="grid gap-5 lg:grid-cols-2 dia-g2">
            <DashPanel
              title="Distribuição por período do dia"
              icon="i-lucide-sun"
              :color="COLORS.amber"
            >
              <DashDonut
                :segments="partSegments"
                :center-value="int(dash.chats.value.total)"
                center-label="chats"
              />
              <div
                v-if="partInsight"
                :class="INSIGHT"
                class="bg-n-alpha-1 border-n-weak"
              >
                <span
                  class="flex-shrink-0 i-lucide-sparkles size-4 mt-0.5"
                  :style="{ color: COLORS.greenDark }"
                />
                <span>{{ partInsight }}</span>
              </div>
            </DashPanel>

            <DashPanel
              title="Intensidade por horário"
              icon="i-lucide-clock"
              :color="COLORS.greenDark"
            >
              <div class="grid grid-cols-12 gap-1.5">
                <div
                  v-for="h in dash.chats.value.hours"
                  :key="h.hour"
                  class="flex justify-center items-center h-9 text-xs font-semibold rounded-lg tabular-nums text-n-slate-11"
                  :style="hourCell(h)"
                  :title="`${h.hour}h: ${int(h.count)} chats`"
                >
                  {{ h.hour }}
                </div>
              </div>
              <div
                v-if="dash.chats.value.peakHour !== null"
                :class="INSIGHT"
                class="bg-n-alpha-1 border-n-weak"
              >
                <span
                  class="flex-shrink-0 i-lucide-flame size-4 mt-0.5"
                  :style="{ color: COLORS.orange }"
                />
                <span>
                  Pico às
                  <strong class="text-n-slate-12">
                    {{ dash.chats.value.peakHour }}h
                  </strong>
                  ({{ int(hourMax) }} chats no período). Concentre o
                  atendimento nesse horário.
                </span>
              </div>
            </DashPanel>

            <DashPanel
              title="Comparativo com período anterior"
              icon="i-lucide-trending-up"
              :color="COLORS.greenDark"
            >
              <div class="flex gap-6 justify-between items-end">
                <div class="flex gap-6 items-end">
                  <div>
                    <div class="text-xs text-n-slate-11">Período atual</div>
                    <div
                      class="text-3xl font-bold tabular-nums text-n-slate-12"
                    >
                      {{ int(dash.chats.value.total) }}
                    </div>
                  </div>
                  <div>
                    <div class="text-xs text-n-slate-11">Anterior</div>
                    <div
                      class="text-2xl font-bold tabular-nums text-n-slate-10"
                    >
                      {{ int(dash.chats.value.previous) }}
                    </div>
                  </div>
                </div>
                <span
                  v-if="dash.chats.value.change !== null"
                  class="flex gap-1 items-center px-2.5 py-1 text-sm font-bold rounded-lg tabular-nums"
                  :style="{
                    background: tint(chatChange.color, 14),
                    color: chatChange.color,
                  }"
                >
                  <span class="size-4" :class="chatChange.icon" />
                  {{ chatChange.text }}
                </span>
              </div>
              <div class="flex flex-col gap-3">
                <div>
                  <div class="flex justify-between mb-1 text-xs text-n-slate-11">
                    <span>Atual</span>
                    <span class="font-semibold tabular-nums text-n-slate-12">
                      {{ int(dash.chats.value.total) }}
                    </span>
                  </div>
                  <div class="overflow-hidden h-2.5 rounded-full bg-n-alpha-2">
                    <span
                      class="block h-full rounded-full"
                      :style="{
                        width: `${compareBars.current}%`,
                        background: COLORS.green,
                      }"
                    />
                  </div>
                </div>
                <div>
                  <div class="flex justify-between mb-1 text-xs text-n-slate-11">
                    <span>Anterior</span>
                    <span class="font-semibold tabular-nums text-n-slate-12">
                      {{ int(dash.chats.value.previous) }}
                    </span>
                  </div>
                  <div class="overflow-hidden h-2.5 rounded-full bg-n-alpha-2">
                    <span
                      class="block h-full rounded-full"
                      :style="{
                        width: `${compareBars.previous}%`,
                        background: COLORS.slate,
                      }"
                    />
                  </div>
                </div>
              </div>
            </DashPanel>

            <DashPanel
              title="Top 5 dias de maior volume"
              icon="i-lucide-flame"
              :color="COLORS.orange"
            >
              <DashBars :items="topDayItems" ranked />
            </DashPanel>
          </div>

          <!-- Estados -->
          <DashPanel
            title="Contatos por Estado"
            :subtitle="`Distribuição geográfica pelo DDD do telefone · ${int(dash.states.value.unknown)} sem DDD brasileiro identificável`"
            icon="i-lucide-map-pin"
            :color="COLORS.greenDark"
          >
            <template #actions>
              <div :class="SEG_BOX">
                <button
                  :class="[SEG, stateMetric === 'leads' ? SEG_ON : SEG_OFF]"
                  @click="stateMetric = 'leads'"
                >
                  Leads por Estado
                </button>
                <button
                  :class="[SEG, stateMetric === 'signed' ? SEG_ON : SEG_OFF]"
                  @click="stateMetric = 'signed'"
                >
                  Contratos por Estado
                </button>
              </div>
            </template>
            <DashBars :items="stateItems" narrow />
            <button
              v-if="stateCount > 5"
              class="flex gap-1.5 justify-center items-center py-2.5 text-sm rounded-xl border transition-colors border-n-weak text-n-slate-11 hover:bg-n-alpha-2"
              @click="showAllStates = !showAllStates"
            >
              {{
                showAllStates
                  ? 'Mostrar só os 5 maiores'
                  : `Ver todos os estados (${stateCount})`
              }}
              <span
                class="i-lucide-chevron-down size-4 transition-transform"
                :class="showAllStates ? 'rotate-180' : ''"
              />
            </button>
          </DashPanel>
        </template>
      </div>
    </div>
  </div>
</template>

<!--
  Impressao / PDF. Sem `scoped` de proposito: precisa alcancar os ancestrais
  da tela (barra lateral, containers com altura fixa) para o painel inteiro
  sair no papel, e nao so o pedaco visivel. Tudo fica dentro de @media print e
  amarrado a .dia-root, entao nao afeta nenhuma outra tela do Chatwoot.
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

  /* A4 em paisagem, com o painel reduzido para caber como na tela. */
  @page {
    size: A4 landscape;
    margin: 8mm;
  }

  .dia-root {
    zoom: 0.72;
  }

  /*
   * As grades do painel dependem da largura da TELA (lg:, xl:). Na impressao
   * o navegador mede a largura do papel e derrubaria tudo para uma coluna;
   * aqui as colunas sao fixadas na mao.
   */
  .dia-root .dia-g2 {
    grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
  }

  .dia-root .dia-g4 {
    grid-template-columns: repeat(4, minmax(0, 1fr)) !important;
  }

  .dia-root .dia-g5 {
    grid-template-columns: repeat(5, minmax(0, 1fr)) !important;
  }

  .dia-root .dia-s3 {
    grid-column: span 3 / span 3 !important;
  }

  .dia-root .dia-s2 {
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
