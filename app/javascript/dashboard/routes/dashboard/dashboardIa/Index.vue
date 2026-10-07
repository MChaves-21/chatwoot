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
import { computed, onMounted, ref } from 'vue';
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
import DashStat from './components/DashStat.vue';
import DashBars from './components/DashBars.vue';
import DashLine from './components/DashLine.vue';

const dash = useDashboardIa();
onMounted(() => dash.load());

const showAllStates = ref(false);
const stateMetric = ref('leads');
const editingGoal = ref(false);
const goalDraft = ref('');

const int = n => Math.round(Number(n) || 0).toLocaleString('pt-BR');
const dec = (n, digits = 1) =>
  (Number(n) || 0).toLocaleString('pt-BR', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
const pct = n => `${dec(n)}%`;

const SEG_ON = 'bg-n-brand text-white font-semibold';
const SEG_OFF = 'text-n-slate-11 hover:bg-n-alpha-2';
const SEG =
  'px-2.5 py-1 text-xs transition-colors border-r last:border-r-0 border-n-weak';
const SELECT =
  'px-2 py-1 text-xs rounded-lg border border-n-weak bg-n-solid-1 text-n-slate-12';

const funnelOptions = [
  { id: ALL_FUNNELS_ID, title: 'Todos os funis' },
  ...DASH_FUNNELS.map(f => ({ id: f.id, title: f.title })),
];

const updatedText = computed(() => {
  if (!dash.loadedAt.value) return '';
  const t = new Date(dash.loadedAt.value).toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
  });
  return `Atualizado às ${t}`;
});

const progressPct = computed(() =>
  dash.progress.total
    ? Math.min((dash.progress.fetched / dash.progress.total) * 100, 100)
    : 0
);

const hasSignedStage = computed(() =>
  dash.byFunnel.value.some(b => b.funnel.signedFrom)
);

const stepItems = steps =>
  steps.map(s => ({
    key: s.label,
    title: s.title,
    value: s.reached,
    note:
      s.next === null ? pct(s.pct) : `${pct(s.pct)} · passam ${pct(s.next)}`,
  }));

const stageItems = stages =>
  stages.map(s => ({
    key: s.label,
    title: s.title,
    value: s.count,
    note: pct(s.pct),
    muted: s.kind !== 'path',
  }));

const closingItems = computed(() =>
  dash.closingTime.value.buckets.map(b => ({
    key: b.key,
    title: b.title,
    value: b.count,
    note: pct(b.pct),
  }))
);

const goalPoints = computed(() =>
  dash.goalData.value.series.map(s => ({
    label: `${String(s.day).padStart(2, '0')}/${dash.goalData.value.month.slice(5, 7)}`,
    value: s.done,
    target: s.target,
  }))
);

const chatPoints = computed(() =>
  dash.chats.value.series.map(s => ({
    label: ymdToBR(s.ymd),
    value: s.count,
  }))
);

const partItems = computed(() =>
  dash.chats.value.parts.map(p => ({
    key: p.key,
    title: p.title,
    value: p.count,
    note: pct(p.pct),
  }))
);

const topDayItems = computed(() =>
  dash.chats.value.top.map(d => ({
    key: d.ymd,
    title: ymdToBR(d.ymd),
    value: d.count,
    note: pct(d.pct),
  }))
);

const hourMax = computed(() =>
  Math.max(1, ...dash.chats.value.hours.map(h => h.count))
);

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

const signedTrend = n => {
  if (n === null) return 'sem base de comparação';
  const sign = n > 0 ? '+' : '';
  return `${sign}${dec(n, 0)}%`;
};

function startGoalEdit() {
  goalDraft.value = String(dash.goal.value);
  editingGoal.value = true;
}

function saveGoal() {
  dash.setGoal(goalDraft.value);
  editingGoal.value = false;
}
</script>

<template>
  <div class="flex flex-col w-full h-full bg-n-background">
    <header
      class="flex flex-wrap gap-2 items-center px-4 py-2.5 border-b border-n-weak"
    >
      <h1 class="text-base font-bold whitespace-nowrap text-n-slate-12">
        Dashboard IA
      </h1>
      <span class="text-xs text-n-slate-11">
        Funil comercial a partir das etapas do Kanban
      </span>
      <span class="flex-1" />
      <span
        v-if="dash.signedPending.value"
        class="text-xs text-n-slate-11"
        title="A data de cada contrato sai do histórico da conversa"
      >
        Lendo datas de assinatura: faltam {{ dash.signedPending.value }}
      </span>
      <span class="text-xs text-n-slate-11">{{ updatedText }}</span>
      <button
        class="px-2.5 py-1.5 text-xs rounded-lg border transition-colors border-n-weak text-n-slate-12 hover:bg-n-alpha-2 disabled:opacity-50"
        :disabled="dash.loading.value"
        @click="dash.load({ force: true })"
      >
        Atualizar
      </button>
    </header>

    <div
      class="flex flex-wrap gap-2 items-center px-4 py-2 border-b border-n-weak"
    >
      <div class="flex overflow-hidden rounded-lg border border-n-weak">
        <button
          v-for="p in PERIODS"
          :key="p.key"
          :class="[SEG, dash.period.value === p.key ? SEG_ON : SEG_OFF]"
          @click="dash.setPeriod(p.key)"
        >
          {{ p.title }}
        </button>
      </div>

      <div
        class="flex overflow-hidden rounded-lg border border-n-weak"
        title="Qual data da conversa o período olha: quando foi criada ou quando teve a última atividade"
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

    <div class="overflow-y-auto flex-1 p-4">
      <div
        v-if="dash.loading.value"
        class="flex flex-col gap-2 justify-center items-center h-64"
      >
        <span class="text-sm text-n-slate-11">
          Lendo conversas… {{ int(dash.progress.fetched) }}
          <template v-if="dash.progress.total">
            de {{ int(dash.progress.total) }}
          </template>
        </span>
        <span class="overflow-hidden w-64 h-1.5 rounded-full bg-n-alpha-2">
          <span
            class="block h-full rounded-full transition-all bg-n-brand"
            :style="{ width: `${progressPct}%` }"
          />
        </span>
      </div>

      <div
        v-else-if="dash.error.value"
        class="flex flex-col gap-2 justify-center items-center h-64"
      >
        <span class="text-sm text-n-slate-12">
          Não deu para montar o painel.
        </span>
        <span class="text-xs text-n-slate-11">{{ dash.error.value }}</span>
        <button
          class="px-3 py-1.5 text-xs font-semibold text-white rounded-lg bg-n-brand hover:opacity-90"
          @click="dash.load({ force: true })"
        >
          Tentar de novo
        </button>
      </div>

      <div v-else class="flex flex-col gap-4 mx-auto max-w-[1400px]">
        <!-- Indicadores -->
        <div class="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
          <DashStat
            label="Cards totais"
            :value="int(dash.summary.value.total)"
            sub="conversas no filtro"
          />
          <DashStat
            label="Contratos assinados"
            :value="int(dash.summary.value.signed)"
            sub="em contrato assinado ou além"
            hint="Conversas que hoje estão na etapa Contrato assinado ou em qualquer etapa depois dela"
          />
          <DashStat
            label="Taxa de conversão"
            :value="pct(dash.summary.value.conversion)"
            sub="assinados / total"
          />
          <DashStat
            label="Taxa de eficiência"
            :value="pct(dash.summary.value.efficiency)"
            sub="assinados / qualificados"
            hint="Dos leads que passaram da triagem, quantos assinaram"
          />
          <DashStat
            label="% Lead qualificado"
            :value="pct(dash.summary.value.qualifiedPct)"
            :sub="`${int(dash.summary.value.qualified)} qualificados · ${int(dash.summary.value.lost)} descartados`"
            hint="Conta quem está HOJE da etapa de qualificado em diante. Lead que qualificou e depois foi descartado aparece como descartado."
          />
        </div>

        <p v-if="!hasSignedStage" class="text-xs text-n-slate-11">
          O funil Trabalhista termina em “Contrato enviado” e não tem etapa de
          contrato assinado, por isso os indicadores de contrato ficam zerados
          nele.
        </p>

        <!-- Funil e etapas, um bloco por funil -->
        <div
          v-for="b in dash.byFunnel.value"
          :key="b.funnel.id"
          class="grid gap-4 lg:grid-cols-2"
        >
          <DashPanel
            :title="`Funil de vendas · ${b.funnel.title}`"
            :subtitle="`Quantos leads estão em cada etapa ou além dela · ${int(b.steps.total)} no total, ${int(b.steps.off)} fora do caminho (descartados ou em espera)`"
          >
            <DashBars :items="stepItems(b.steps.steps)" />
          </DashPanel>

          <DashPanel
            :title="`Leads por etapa · ${b.funnel.title}`"
            subtitle="Onde cada conversa está agora, na ordem das colunas do Kanban. Em cinza: descartados e em espera"
          >
            <DashBars :items="stageItems(b.stages)" />
          </DashPanel>
        </div>

        <div class="grid gap-4 lg:grid-cols-2">
          <!-- Tempo ate fechamento -->
          <DashPanel
            title="Tempo médio até fechamento"
            subtitle="Da criação da conversa até a etiqueta de contrato assinado"
          >
            <div class="flex flex-wrap gap-x-8 gap-y-2 items-end">
              <div>
                <span
                  class="text-3xl font-semibold tabular-nums text-n-slate-12"
                >
                  {{ dec(dash.closingTime.value.avgDays) }}
                </span>
                <span class="ml-1 text-sm text-n-slate-11">dias em média</span>
              </div>
              <span class="text-xs text-n-slate-11">
                mediana {{ dec(dash.closingTime.value.medianDays) }} dias ·
                {{ int(dash.closingTime.value.n) }} contratos com data
              </span>
            </div>
            <DashBars
              :items="closingItems"
              empty="Nenhum contrato com data no filtro."
            />
            <p
              v-if="dash.closingTime.value.missing && !dash.signedPending.value"
              class="text-xs text-n-slate-10"
            >
              {{ int(dash.closingTime.value.missing) }} contrato(s) ficaram de
              fora: o histórico da conversa não registra quando a etiqueta de
              contrato assinado foi aplicada.
            </p>
          </DashPanel>

          <!-- Meta -->
          <DashPanel
            title="Meta de vendas"
            :subtitle="`Contratos assinados em ${dash.goalData.value.month.slice(5, 7)}/${dash.goalData.value.month.slice(0, 4)}, pela data da assinatura`"
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
                  class="px-2 py-1 w-20 text-xs rounded-lg border border-n-weak bg-n-solid-1 text-n-slate-12"
                />
                <button
                  type="submit"
                  class="px-2 py-1 text-xs font-semibold text-white rounded-lg bg-n-brand"
                >
                  Salvar
                </button>
              </form>
              <button
                v-else
                class="px-2 py-1 text-xs rounded-lg border border-n-weak text-n-slate-11 hover:bg-n-alpha-2"
                title="A meta fica salva só neste navegador"
                @click="startGoalEdit"
              >
                Meta: {{ int(dash.goalData.value.goal) }} · alterar
              </button>
            </template>

            <div class="flex flex-wrap gap-x-8 gap-y-2 items-end">
              <div>
                <span
                  class="text-3xl font-semibold tabular-nums text-n-slate-12"
                >
                  {{ int(dash.goalData.value.done) }}
                </span>
                <span class="ml-1 text-sm text-n-slate-11">
                  de {{ int(dash.goalData.value.goal) }} ·
                  {{ pct(dash.goalData.value.donePct) }} da meta
                </span>
              </div>
            </div>
            <span class="overflow-hidden h-2 rounded-full bg-n-alpha-2">
              <span
                class="block h-full rounded-full bg-n-brand"
                :style="{
                  width: `${Math.min(dash.goalData.value.donePct, 100)}%`,
                }"
              />
            </span>
            <dl class="grid grid-cols-2 gap-x-4 gap-y-2 text-xs sm:grid-cols-4">
              <div>
                <dt class="text-n-slate-11">Faltam</dt>
                <dd class="font-semibold tabular-nums text-n-slate-12">
                  {{ int(dash.goalData.value.left) }}
                </dd>
              </div>
              <div>
                <dt class="text-n-slate-11">Projeção do mês</dt>
                <dd class="font-semibold tabular-nums text-n-slate-12">
                  {{ int(dash.goalData.value.projection) }}
                  ({{ pct(dash.goalData.value.projectionPct) }})
                </dd>
              </div>
              <div>
                <dt class="text-n-slate-11">Necessário por dia</dt>
                <dd class="font-semibold tabular-nums text-n-slate-12">
                  {{ dec(dash.goalData.value.neededPerDay, 2) }}
                </dd>
              </div>
              <div>
                <dt class="text-n-slate-11">Melhor dia</dt>
                <dd class="font-semibold tabular-nums text-n-slate-12">
                  <template v-if="dash.goalData.value.bestDay">
                    {{ int(dash.goalData.value.bestDay.count) }} no dia
                    {{ dash.goalData.value.bestDay.day }}
                  </template>
                  <template v-else>—</template>
                </dd>
              </div>
            </dl>
            <DashLine
              :points="goalPoints"
              value-label="Realizado"
              target-label="Ritmo da meta"
            />
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
        <DashPanel
          title="Evolução de novos chats"
          subtitle="Conversas criadas por dia. Segue o funil e o responsável escolhidos; o período é o deste bloco"
        >
          <template #actions>
            <div class="flex overflow-hidden rounded-lg border border-n-weak">
              <button
                v-for="r in CHAT_RANGES"
                :key="r.key"
                :class="[SEG, dash.chatDays.value === r.key ? SEG_ON : SEG_OFF]"
                @click="dash.chatDays.value = r.key"
              >
                {{ r.title }}
              </button>
            </div>
          </template>

          <dl class="grid grid-cols-2 gap-x-4 gap-y-2 text-xs sm:grid-cols-5">
            <div>
              <dt class="text-n-slate-11">Total de chats</dt>
              <dd class="text-lg font-semibold tabular-nums text-n-slate-12">
                {{ int(dash.chats.value.total) }}
              </dd>
            </div>
            <div>
              <dt class="text-n-slate-11">Média por dia</dt>
              <dd class="text-lg font-semibold tabular-nums text-n-slate-12">
                {{ dec(dash.chats.value.avg) }}
              </dd>
            </div>
            <div>
              <dt class="text-n-slate-11">Pico</dt>
              <dd class="text-lg font-semibold tabular-nums text-n-slate-12">
                {{ int(dash.chats.value.peak.count) }}
                <span class="text-xs font-normal text-n-slate-11">
                  em {{ ymdToBR(dash.chats.value.peak.ymd) }}
                </span>
              </dd>
            </div>
            <div title="Segunda metade do período contra a primeira">
              <dt class="text-n-slate-11">Tendência</dt>
              <dd class="text-lg font-semibold tabular-nums text-n-slate-12">
                {{ signedTrend(dash.chats.value.trend) }}
              </dd>
            </div>
            <div
              :title="`Período anterior de mesmo tamanho: ${int(dash.chats.value.previous)} chats`"
            >
              <dt class="text-n-slate-11">Contra o período anterior</dt>
              <dd class="text-lg font-semibold tabular-nums text-n-slate-12">
                {{ signedTrend(dash.chats.value.change) }}
                <span class="text-xs font-normal text-n-slate-11">
                  (eram {{ int(dash.chats.value.previous) }})
                </span>
              </dd>
            </div>
          </dl>

          <DashLine :points="chatPoints" value-label="Novos chats" />

          <div class="grid gap-6 lg:grid-cols-3">
            <div class="flex flex-col gap-2">
              <h3 class="text-xs font-semibold text-n-slate-11">
                Período do dia
              </h3>
              <DashBars :items="partItems" />
            </div>

            <div class="flex flex-col gap-2">
              <h3 class="text-xs font-semibold text-n-slate-11">
                Por horário
                <template v-if="dash.chats.value.peakHour !== null">
                  · pico às {{ dash.chats.value.peakHour }}h
                </template>
              </h3>
              <div class="flex gap-px items-end h-24">
                <div
                  v-for="h in dash.chats.value.hours"
                  :key="h.hour"
                  class="flex flex-1 items-end h-full"
                  :title="`${h.hour}h: ${int(h.count)} chats`"
                >
                  <span
                    class="block w-full rounded-t bg-n-brand"
                    :style="{
                      height: `${(h.count / hourMax) * 100}%`,
                      minHeight: h.count ? '2px' : '0',
                    }"
                  />
                </div>
              </div>
              <div class="flex justify-between text-[10.5px] text-n-slate-10">
                <span>0h</span><span>6h</span><span>12h</span><span>18h</span
                ><span>23h</span>
              </div>
            </div>

            <div class="flex flex-col gap-2">
              <h3 class="text-xs font-semibold text-n-slate-11">
                Dias de maior volume
              </h3>
              <DashBars :items="topDayItems" />
            </div>
          </div>
        </DashPanel>

        <!-- Estados -->
        <DashPanel
          title="Contatos por estado"
          :subtitle="`Estado pelo DDD do telefone · ${int(dash.states.value.unknown)} sem DDD brasileiro identificável`"
        >
          <template #actions>
            <div class="flex overflow-hidden rounded-lg border border-n-weak">
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
            </div>
          </template>
          <DashBars :items="stateItems" />
          <button
            v-if="dash.states.value.list.length > 5"
            class="self-start text-xs text-n-brand hover:underline"
            @click="showAllStates = !showAllStates"
          >
            {{
              showAllStates
                ? 'Mostrar só os 5 maiores'
                : `Ver todos os estados (${dash.states.value.list.length})`
            }}
          </button>
        </DashPanel>
      </div>
    </div>
  </div>
</template>
