<script setup>
/**
 * Relatorio da Equipe (fork Goncalves & Silva, 16/10/2026).
 *
 * Duas perguntas do escritorio numa tela so:
 *   1. Relatorio de mensagens — enviadas x recebidas por dia, por usuario,
 *      IA x humano, com a lista exportavel em CSV.
 *   2. Quantidade de conversas por usuario — quantas conversas cada um
 *      RESPONDEU no periodo (nao importa quem e o responsavel).
 *
 * Os numeros vem prontos do servidor (relatorio_equipe_controller.rb); a tela
 * so filtra e desenha. Quem conta como IA e configuravel aqui: o n8n envia
 * as respostas da Juliana com o token de um usuario do Chatwoot, entao o
 * Chatwoot sozinho nao sabe que aquilo e IA.
 */
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { useMapGetter, useStore } from 'dashboard/composables/store';
import RelatorioEquipeAPI from './api';
import { CATEGORIES, DEFAULT_PERIOD, LS_KEY, PERIODS } from './constants';
import { FUNNELS, HOME_ACCOUNT_ID } from '../kanban/constants';
import DashPanel from '../dashboardIa/components/DashPanel.vue';
import DashStack from '../dashboardIa/components/DashStack.vue';
import DailyChart from './components/DailyChart.vue';

const route = useRoute();
const store = useStore();
const inboxes = useMapGetter('inboxes/getInboxes');
const allLabels = useMapGetter('labels/getLabels');

// ------------------------------------------------------------ preferencias

const lsKey = `${LS_KEY}_conta_${route.params.accountId}`;
function readPrefs() {
  try {
    return JSON.parse(window.localStorage.getItem(lsKey) || '{}') || {};
  } catch (e) {
    return {};
  }
}
const prefs = readPrefs();

const period = ref(prefs.period || DEFAULT_PERIOD);
const customFrom = ref('');
const customTo = ref('');
const inboxId = ref(prefs.inboxId || null);
const userId = ref(null);
const label = ref('');

watch([period, inboxId], () => {
  try {
    window.localStorage.setItem(
      lsKey,
      JSON.stringify({
        period: period.value === 'custom' ? DEFAULT_PERIOD : period.value,
        inboxId: inboxId.value,
      })
    );
  } catch (e) {
    // navegador sem storage: so nao lembra
  }
});

// ------------------------------------------------------------------ datas

const pad = n => String(n).padStart(2, '0');
const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const addDays = (d, n) => {
  const c = new Date(d);
  c.setDate(c.getDate() + n);
  return c;
};
const br = s => (s ? s.split('-').reverse().join('/') : '');

const range = computed(() => {
  const today = new Date();
  switch (period.value) {
    case 'hoje':
      return { since: ymd(today), until: ymd(today) };
    case '30d':
      return { since: ymd(addDays(today, -29)), until: ymd(today) };
    case 'mes':
      return {
        since: ymd(new Date(today.getFullYear(), today.getMonth(), 1)),
        until: ymd(today),
      };
    case 'custom':
      return {
        since: customFrom.value || ymd(addDays(today, -6)),
        until: customTo.value || ymd(today),
      };
    default:
      return { since: ymd(addDays(today, -6)), until: ymd(today) };
  }
});

const filters = computed(() => ({
  ...range.value,
  inboxId: inboxId.value,
  userId: userId.value,
  label: label.value,
}));

// ------------------------------------------------------------------ dados

const data = ref(null);
const loading = ref(false);
const error = ref('');
let seq = 0;

async function load() {
  seq += 1;
  const mine = seq;
  loading.value = true;
  error.value = '';
  try {
    const res = await RelatorioEquipeAPI.summary(filters.value);
    if (mine === seq) data.value = res;
  } catch (e) {
    if (mine !== seq) return;
    const status = e && e.response && e.response.status;
    error.value =
      status === 403
        ? 'Só administradores veem este relatório.'
        : status === 404
          ? 'O servidor ainda não tem este relatório. Ele aparece depois do próximo deploy do fork.'
          : 'Não deu para carregar o relatório. Tente atualizar.';
  } finally {
    if (mine === seq) loading.value = false;
  }
}

watch(filters, load, { deep: true });
onMounted(() => {
  store.dispatch('inboxes/get');
  store.dispatch('labels/get');
  load();
});

const exporting = ref(false);
const exportNote = ref('');
async function exportCsv() {
  exporting.value = true;
  exportNote.value = '';
  try {
    const { truncated } = await RelatorioEquipeAPI.downloadCsv(filters.value);
    exportNote.value = truncated
      ? 'A lista passou de 50 mil mensagens e foi cortada. Diminua o período para baixar tudo.'
      : '';
  } catch (e) {
    exportNote.value = 'Não deu para gerar o CSV. Tente de novo.';
  } finally {
    exporting.value = false;
  }
}

// ----------------------------------------------------------- quem e IA

const showIaConfig = ref(false);
const iaDraft = ref([]);
const savingIa = ref(false);
watch(
  () => data.value && data.value.ia_user_ids,
  ids => {
    iaDraft.value = [...(ids || [])];
  }
);
const iaDirty = computed(() => {
  const saved = new Set((data.value && data.value.ia_user_ids) || []);
  return (
    iaDraft.value.length !== saved.size ||
    iaDraft.value.some(id => !saved.has(id))
  );
});
function toggleIa(id) {
  iaDraft.value = iaDraft.value.includes(id)
    ? iaDraft.value.filter(x => x !== id)
    : [...iaDraft.value, id];
}
async function saveIa() {
  savingIa.value = true;
  try {
    await RelatorioEquipeAPI.saveIaUsers(iaDraft.value);
    showIaConfig.value = false;
    await load();
  } catch (e) {
    error.value = 'Não deu para salvar quem conta como IA.';
  } finally {
    savingIa.value = false;
  }
}

// ---------------------------------------------------------- derivados

const users = computed(() => (data.value && data.value.users) || []);
const iaIds = computed(() => new Set((data.value && data.value.ia_user_ids) || []));

const totals = computed(() => {
  const t = (data.value && data.value.totals) || {};
  const m = t.mensagens || {};
  const sent = (m.humano || 0) + (m.ia || 0) + (m.sem_autor || 0);
  return { ...t, m, sent };
});

const int = n => Number(n || 0).toLocaleString('pt-BR');
const pctOf = (part, total) =>
  total ? `${Math.round((part / total) * 100)}%` : '—';

const kpis = computed(() => {
  const t = totals.value;
  return [
    {
      key: 'recebida',
      label: 'Recebidas do cliente',
      value: int(t.m.recebida),
      sub: `em ${int(t.conversas_com_cliente)} conversas`,
    },
    {
      key: 'enviadas',
      label: 'Enviadas',
      value: int(t.sent),
      sub: `equipe ${pctOf(t.m.humano, t.sent)} · IA ${pctOf(t.m.ia, t.sent)}`,
    },
    {
      key: 'equipe',
      label: 'Conversas respondidas pela equipe',
      value: int(t.conversas_equipe),
      sub: `IA respondeu ${int(t.conversas_ia)}`,
    },
    {
      key: 'semresp',
      label: 'Conversas sem resposta',
      value: int(t.conversas_sem_resposta),
      sub: 'cliente escreveu e ninguém enviou nada no período',
      warn: (t.conversas_sem_resposta || 0) > 0,
    },
  ];
});

const sentSegments = computed(() =>
  CATEGORIES.filter(c => c.key !== 'recebida').map(c => ({
    key: c.key,
    title: c.title,
    value: totals.value.m[c.key] || 0,
    color: c.color,
  }))
);

// Tabela por usuario. Sem filtro de usuario, quem e da equipe e nao
// respondeu nada aparece com zero — tambem e informacao.
const userRows = computed(() => {
  const rows = ((data.value && data.value.per_user) || []).map(r => ({
    ...r,
    key: `${r.tipo}-${r.id}`,
  }));
  if (!userId.value) {
    const seen = new Set(rows.filter(r => r.tipo === 'User').map(r => r.id));
    users.value
      .filter(u => !seen.has(u.id) && !iaIds.value.has(u.id))
      .forEach(u =>
        rows.push({
          key: `User-${u.id}`,
          id: u.id,
          tipo: 'User',
          name: u.name,
          ia: false,
          mensagens: 0,
          conversas: 0,
        })
      );
  }
  return rows;
});
const maxConversas = computed(() =>
  Math.max(1, ...userRows.value.map(r => r.conversas))
);
const perConv = r =>
  r.conversas
    ? (r.mensagens / r.conversas).toLocaleString('pt-BR', {
        maximumFractionDigits: 1,
      })
    : '—';

// Filtro de etapa: etapas do Kanban primeiro (so na conta dona dos funis),
// depois todas as etiquetas.
const stageGroups = computed(() => {
  if (Number(route.params.accountId) !== HOME_ACCOUNT_ID) return [];
  return FUNNELS.filter(f => (f.columns || []).length).map(f => ({
    id: f.id,
    title: `Kanban — ${f.title}`,
    options: f.columns.map(c => ({ value: c.label, title: c.title })),
  }));
});
const labelOptions = computed(() =>
  [...(allLabels.value || [])]
    .map(l => l.title)
    .sort((a, b) => a.localeCompare(b, 'pt-BR'))
);

const periodText = computed(() => {
  const p = data.value && data.value.period;
  if (!p) return '';
  return p.since === p.until ? br(p.since) : `${br(p.since)} a ${br(p.until)}`;
});

// ---------------------------------------------------------------- estilos

const SEG_BOX = 'flex p-0.5 gap-0.5 rounded-lg bg-n-alpha-2';
const SEG = 'px-2.5 py-1 text-xs rounded-md transition-colors whitespace-nowrap';
const SEG_ON = 'bg-n-solid-1 text-n-slate-12 font-semibold shadow-sm';
const SEG_OFF = 'text-n-slate-11 hover:text-n-slate-12';
const SELECT =
  '!w-auto !min-w-[10rem] !max-w-[16rem] !mb-0 !h-8 !py-0 !text-xs !rounded-lg !bg-n-solid-1';
const DATE = '!w-36 !mb-0 !h-8 !py-0 !text-xs !rounded-lg !bg-n-solid-1';
const BTN =
  'flex gap-1.5 items-center px-2.5 h-8 text-xs rounded-lg border transition-colors border-n-weak bg-n-solid-1 text-n-slate-11 hover:text-n-slate-12 hover:bg-n-alpha-1 disabled:opacity-60';
</script>

<template>
  <div class="flex flex-col w-full h-full bg-n-background">
    <div class="overflow-y-auto flex-1">
      <div class="flex flex-col gap-5 px-6 py-5 mx-auto max-w-[1200px]">
        <header class="flex flex-wrap gap-4 justify-between items-end">
          <div>
            <p
              class="text-[11px] font-semibold tracking-[0.14em] uppercase text-n-brand"
            >
              Relatório da Equipe
            </p>
            <h1
              class="mt-1 text-2xl font-semibold tracking-tight text-n-slate-12"
            >
              Mensagens e conversas por usuário
            </h1>
            <p v-if="periodText" class="mt-1 text-xs text-n-slate-10">
              {{ periodText }}
            </p>
          </div>
          <div class="flex flex-wrap gap-2">
            <button :class="BTN" @click="showIaConfig = !showIaConfig">
              <span class="i-lucide-bot size-3.5" />
              Quem conta como IA
            </button>
            <button :class="BTN" :disabled="loading" @click="load">
              <span
                class="i-lucide-refresh-cw size-3.5"
                :class="{ 'animate-spin': loading }"
              />
              Atualizar
            </button>
            <button
              :class="BTN"
              :disabled="exporting || !data"
              @click="exportCsv"
            >
              <span
                class="size-3.5"
                :class="
                  exporting
                    ? 'i-lucide-loader-circle animate-spin'
                    : 'i-lucide-download'
                "
              />
              Exportar mensagens (CSV)
            </button>
          </div>
        </header>

        <p
          v-if="exportNote"
          class="px-3 py-2 text-xs rounded-lg bg-n-amber-3 text-n-amber-11"
        >
          {{ exportNote }}
        </p>

        <!-- Quem conta como IA -->
        <DashPanel
          v-if="showIaConfig"
          title="Quem conta como IA"
          subtitle="O n8n responde pela Juliana usando o login de um usuário. Marque esse usuário para as mensagens dele contarem como IA, e não como equipe. Vale para todos que abrem o relatório."
          icon="i-lucide-bot"
        >
          <div class="flex flex-wrap gap-2">
            <label
              v-for="u in users"
              :key="u.id"
              class="flex gap-2 items-center px-3 py-1.5 text-sm rounded-lg border cursor-pointer select-none"
              :class="
                iaDraft.includes(u.id)
                  ? 'border-n-brand bg-n-brand/5 text-n-slate-12'
                  : 'border-n-weak text-n-slate-11'
              "
            >
              <input
                type="checkbox"
                class="!m-0"
                :checked="iaDraft.includes(u.id)"
                @change="toggleIa(u.id)"
              />
              {{ u.name }}
            </label>
          </div>
          <div class="flex gap-2 justify-end">
            <button :class="BTN" @click="showIaConfig = false">Fechar</button>
            <button
              class="px-3 h-8 text-xs font-semibold text-white rounded-lg bg-n-brand disabled:opacity-60"
              :disabled="!iaDirty || savingIa"
              @click="saveIa"
            >
              {{ savingIa ? 'Salvando…' : 'Salvar' }}
            </button>
          </div>
        </DashPanel>

        <!-- Filtros -->
        <div
          class="flex flex-wrap gap-x-4 gap-y-2 items-center p-2 rounded-xl border border-n-weak bg-n-solid-1"
        >
          <div :class="SEG_BOX">
            <button
              v-for="p in PERIODS"
              :key="p.key"
              :class="[SEG, period === p.key ? SEG_ON : SEG_OFF]"
              @click="period = p.key"
            >
              {{ p.title }}
            </button>
            <button
              :class="[SEG, period === 'custom' ? SEG_ON : SEG_OFF]"
              @click="period = 'custom'"
            >
              Personalizado
            </button>
          </div>

          <div v-if="period === 'custom'" class="flex gap-1.5 items-center">
            <input
              v-model="customFrom"
              type="date"
              aria-label="Data inicial"
              :class="DATE"
            />
            <span class="text-xs text-n-slate-10">até</span>
            <input
              v-model="customTo"
              type="date"
              aria-label="Data final"
              :class="DATE"
            />
          </div>

          <span class="flex-1" />

          <select
            :class="SELECT"
            :value="inboxId || ''"
            aria-label="Caixa de entrada"
            @change="inboxId = $event.target.value ? Number($event.target.value) : null"
          >
            <option value="">Todas as caixas</option>
            <option v-for="i in inboxes" :key="i.id" :value="i.id">
              {{ i.name }}
            </option>
          </select>

          <select
            :class="SELECT"
            :value="userId || ''"
            aria-label="Usuário"
            @change="userId = $event.target.value ? Number($event.target.value) : null"
          >
            <option value="">Todos os usuários</option>
            <option v-for="u in users" :key="u.id" :value="u.id">
              {{ u.name }}{{ iaIds.has(u.id) ? ' (IA)' : '' }}
            </option>
          </select>

          <select
            :class="SELECT"
            :value="label"
            aria-label="Etapa ou etiqueta"
            @change="label = $event.target.value"
          >
            <option value="">Todas as etapas e etiquetas</option>
            <optgroup v-for="g in stageGroups" :key="g.id" :label="g.title">
              <option
                v-for="o in g.options"
                :key="`${g.id}-${o.value}`"
                :value="o.value"
              >
                {{ o.title }}
              </option>
            </optgroup>
            <optgroup label="Etiquetas">
              <option v-for="l in labelOptions" :key="l" :value="l">
                {{ l }}
              </option>
            </optgroup>
          </select>
        </div>

        <p
          v-if="userId"
          class="-mt-3 text-xs text-n-slate-10"
        >
          Com um usuário escolhido, os números olham só as conversas que ele
          respondeu no período.
        </p>

        <p
          v-if="error"
          class="px-3 py-2 text-sm rounded-lg bg-n-ruby-3 text-n-ruby-11"
        >
          {{ error }}
        </p>

        <div
          v-if="loading && !data"
          class="flex gap-3 justify-center items-center h-60 rounded-xl border border-n-weak bg-n-solid-1"
        >
          <span class="i-lucide-loader-circle size-6 animate-spin text-n-brand" />
          <span class="text-sm text-n-slate-11">Montando o relatório…</span>
        </div>

        <template v-if="data">
          <!-- Indicadores -->
          <div
            class="grid grid-cols-2 gap-3 lg:grid-cols-4"
            :class="{ 'opacity-60': loading }"
          >
            <div
              v-for="k in kpis"
              :key="k.key"
              class="flex flex-col gap-1.5 p-4 rounded-xl border border-n-weak bg-n-solid-1"
            >
              <span class="text-xs text-n-slate-11">{{ k.label }}</span>
              <span
                class="text-[28px] font-semibold tracking-tight leading-none tabular-nums"
                :class="k.warn ? 'text-n-ruby-11' : 'text-n-slate-12'"
              >
                {{ k.value }}
              </span>
              <span class="text-[11px] text-n-slate-10">{{ k.sub }}</span>
            </div>
          </div>

          <!-- 1. Relatorio de mensagens -->
          <div
            class="grid grid-cols-1 gap-4 lg:grid-cols-3"
            :class="{ 'opacity-60': loading }"
          >
            <DashPanel
              class="lg:col-span-2"
              title="Mensagens por dia"
              subtitle="Coluna cinza: o que o cliente mandou. Coluna colorida: o que saiu do escritório. Passe o mouse para ver os números."
              icon="i-lucide-messages-square"
            >
              <DailyChart :days="data.per_day" />
            </DashPanel>

            <DashPanel
              title="Quem enviou"
              subtitle="Mensagens enviadas no período, sem notas privadas."
              icon="i-lucide-split"
            >
              <DashStack :segments="sentSegments" />
              <p class="text-xs leading-relaxed text-n-slate-10">
                “Sem autor” é mensagem que saiu direto do celular ou de
                integração, sem login no Chatwoot. Se as respostas da IA
                aparecem como equipe, ajuste em “Quem conta como IA”.
              </p>
            </DashPanel>
          </div>

          <!-- 2. Conversas por usuario -->
          <DashPanel
            title="Conversas por usuário"
            subtitle="Conversas em que o usuário enviou pelo menos uma mensagem no período, mesmo sem ser o responsável."
            icon="i-lucide-users"
            :class="{ 'opacity-60': loading }"
          >
            <p v-if="!userRows.length" class="text-xs text-n-slate-10">
              Ninguém enviou mensagem no filtro.
            </p>
            <div v-else class="overflow-x-auto -mx-1">
              <table class="w-full text-sm">
                <thead class="text-xs text-left text-n-slate-10">
                  <tr>
                    <th class="px-2 py-1.5 font-medium">Usuário</th>
                    <th class="px-2 py-1.5 font-medium text-right">
                      Conversas
                    </th>
                    <th class="px-2 py-1.5 font-medium w-1/3" />
                    <th class="px-2 py-1.5 font-medium text-right">
                      Mensagens enviadas
                    </th>
                    <th class="px-2 py-1.5 font-medium text-right">
                      Msgs por conversa
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <tr
                    v-for="r in userRows"
                    :key="r.key"
                    class="border-t border-n-weak"
                  >
                    <td class="px-2 py-2">
                      <span
                        class="font-medium"
                        :class="r.conversas ? 'text-n-slate-12' : 'text-n-slate-10'"
                      >
                        {{ r.name }}
                      </span>
                      <span
                        v-if="r.ia"
                        class="ml-1.5 px-1.5 py-0.5 text-[10px] font-semibold rounded bg-[#8b5cf6]/15 text-[#7c3aed]"
                      >
                        IA
                      </span>
                    </td>
                    <td
                      class="px-2 py-2 font-semibold text-right tabular-nums text-n-slate-12"
                    >
                      {{ int(r.conversas) }}
                    </td>
                    <td class="px-2 py-2">
                      <span
                        class="block overflow-hidden h-2 rounded-full bg-n-alpha-2"
                      >
                        <span
                          class="block h-full rounded-full"
                          :style="{
                            width: `${(r.conversas / maxConversas) * 100}%`,
                            background: r.ia ? '#8b5cf6' : '#2781F6',
                          }"
                        />
                      </span>
                    </td>
                    <td class="px-2 py-2 text-right tabular-nums text-n-slate-11">
                      {{ int(r.mensagens) }}
                    </td>
                    <td class="px-2 py-2 text-right tabular-nums text-n-slate-11">
                      {{ perConv(r) }}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </DashPanel>
        </template>
      </div>
    </div>
  </div>
</template>
