<script setup>
/**
 * Kanban Comercial — tela principal.
 *
 * Portado de kanban-comercial.vercel.app. Diferencas de fundo em relacao ao
 * original:
 *
 *   - as chamadas vao direto para a API do Chatwoot pela sessao do agente;
 *     o webhook kanban-proxy e o segredo compartilhado saem do caminho;
 *   - nao ha mais innerHTML com dado de conversa — o Vue escapa por padrao;
 *   - o botao "Atualizar do Supabase" foi removido: ele chamava o workflow
 *     kanban-sync, que e outro assunto (Supabase -> Chatwoot) e estava
 *     terminando com "aplicado: 0". Recolocar depois de consertado.
 */

import { computed, onMounted, ref } from 'vue';
import { useStore } from 'vuex';
import { useAlert } from 'dashboard/composables';
import { frontendURL } from 'dashboard/helper/URLHelper';

import KanbanColumn from './components/KanbanColumn.vue';
import ContactPopup from './components/ContactPopup.vue';
import DayViewModal from './components/DayViewModal.vue';
import FiltersModal from './components/FiltersModal.vue';
import SettingsModal from './components/SettingsModal.vue';

import { useKanbanBoard } from './useKanbanBoard';
import { exportToExcel } from './excel';
import { activeFilterCount, passesFilter } from './helpers';

const store = useStore();
const accountId = computed(() => store.getters.getCurrentAccountId);

const board = useKanbanBoard();
const {
  prefs,
  filters,
  columnDefs,
  tagDefs,
  filtersActive,
  errors,
  statusText,
  leadCache,
} = board;

const showFilters = ref(false);
const showSettings = ref(false);
const showDayView = ref(false);
const dayMode = ref('created');
const dayLoading = ref(false);
const openConversation = ref(null);
const draggingId = ref(null);
const dragFromLabel = ref(null);
const isExporting = ref(false);
const isEnriching = ref(false);

const conversationUrl = id =>
  frontendURL(`accounts/${accountId.value}/conversations/${id}`);

const filterCount = computed(() => activeFilterCount(filters));

const filteredTotal = computed(() =>
  board
    .allConversations()
    .filter(c => passesFilter(c, filters, leadCache)).length
);

const leadLookupEnabled = computed(() =>
  Boolean(prefs.leadUrl && prefs.secret)
);

onMounted(() => board.loadAll());

// ------------------------------------------------------------- drag & drop

const draggingConv = ref(null);

const onDragStart = ({ conversation, label }) => {
  draggingConv.value = conversation;
  draggingId.value = conversation.id;
  dragFromLabel.value = label;
};

const onDragEnd = () => {
  draggingId.value = null;
};

const onDrop = async toLabel => {
  const conv = draggingConv.value;
  const fromLabel = dragFromLabel.value;
  draggingConv.value = null;
  draggingId.value = null;
  dragFromLabel.value = null;
  if (!conv || !fromLabel || fromLabel === toLabel) return;

  const res = await board.moveToStage(conv, fromLabel, toLabel);
  const title = (columnDefs.value.find(c => c.label === toLabel) || {}).title;
  if (res.ok) useAlert(`Movido para "${title}"`);
  else useAlert(`Falha ao mover: ${res.error}`);
};

// ------------------------------------------------------------------ acoes

const moveFromPopup = async (conv, fromLabel, toLabel) => {
  const res = await board.moveToStage(conv, fromLabel, toLabel);
  const title = (columnDefs.value.find(c => c.label === toLabel) || {}).title;
  useAlert(res.ok ? `Movido para "${title}"` : `Falha ao mover: ${res.error}`);
  return res;
};

const toggleTagFromPopup = async (conv, label) => {
  const res = await board.toggleTag(conv, label);
  useAlert(res.ok ? 'Tags atualizadas' : `Falha ao salvar tag: ${res.error}`);
  return res;
};

const onFlagFilterChange = async () => {
  if (!filters.flag) return;
  isEnriching.value = true;
  await board.enrichLeads();
  isEnriching.value = false;
};

const saveSettings = payload => {
  Object.assign(prefs, payload);
  board.savePrefs();
  showSettings.value = false;
  board.loadAll();
};

const openDayView = async mode => {
  dayMode.value = mode;
  showDayView.value = true;
  dayLoading.value = true;
  try {
    await board.loadEverything();
  } catch (e) {
    useAlert(`Falha ao carregar: ${e.message}`);
  }
  dayLoading.value = false;
};

const exportBoard = async () => {
  isExporting.value = true;
  try {
    await board.loadEverything();
    if (filters.flag) await board.enrichLeads();

    const all = board.allConversations();
    const list = filtersActive.value
      ? all.filter(c => passesFilter(c, filters, leadCache))
      : all;

    if (!list.length) {
      useAlert('Nenhuma conversa para exportar com o filtro atual.');
      return;
    }
    await exportToExcel({
      conversations: list,
      prefix: filtersActive.value ? 'kanban-filtrado' : 'kanban-panorama',
      columns: columnDefs.value,
      tags: tagDefs.value,
    });
    useAlert(
      `Excel gerado (${list.length} cartões${filtersActive.value ? ', filtrado' : ''}).`
    );
  } catch (err) {
    useAlert(`Falha no Excel: ${err.message}`);
  } finally {
    isExporting.value = false;
  }
};

const exportDay = async ({ list, mode, date }) => {
  try {
    await exportToExcel({
      conversations: list,
      prefix: `kanban-${mode === 'updated' ? 'atualizados' : 'criados'}`,
      columns: columnDefs.value,
      tags: tagDefs.value,
      stampOverride: date,
    });
    useAlert(`Excel gerado (${list.length} cartões).`);
  } catch (err) {
    useAlert(`Falha no Excel: ${err.message}`);
  }
};

const BTN =
  'px-3 py-1.5 text-sm rounded-lg border transition-colors border-n-weak text-n-slate-12 hover:bg-n-alpha-2 disabled:opacity-50';
</script>

<template>
  <div class="flex flex-col w-full h-full bg-n-background">
    <header
      class="flex flex-wrap gap-2 items-center px-4 py-2.5 border-b border-n-weak"
    >
      <h1 class="text-base font-bold text-n-slate-12">Kanban Comercial</h1>

      <span class="flex-1" />

      <span class="text-xs text-n-slate-11">{{ statusText }}</span>

      <button :class="BTN" @click="showFilters = true">
        Filtros<template v-if="filterCount"> ({{ filterCount }})</template>
      </button>
      <button :class="BTN" :disabled="isExporting" @click="exportBoard">
        {{ isExporting ? 'Gerando...' : 'Exportar Excel' }}
      </button>
      <button :class="BTN" @click="openDayView('created')">Criados hoje</button>
      <button :class="BTN" @click="openDayView('updated')">
        Atualizados hoje
      </button>
      <button :class="BTN" @click="board.loadAll()">Recarregar</button>
      <button :class="BTN" @click="showSettings = true">Configurações</button>
    </header>

    <div class="flex overflow-x-auto overflow-y-hidden flex-1 gap-3 items-start p-3.5">
      <KanbanColumn
        v-for="col in columnDefs"
        :key="col.label"
        :column="col"
        :conversations="board.visibleIn(col.label)"
        :count-label="board.countLabel(col.label)"
        :tags="tagDefs"
        :has-more="board.hasMore(col.label)"
        :is-filtered="filtersActive"
        :error="errors[col.label] || ''"
        :dragging-id="draggingId"
        :conversation-url="conversationUrl"
        @drop="onDrop(col.label)"
        @load-more="board.loadColumn(col.label).catch(() => {})"
        @open-card="openConversation = $event"
        @drag-start="onDragStart"
        @drag-end="onDragEnd"
      />
    </div>

    <FiltersModal
      v-if="showFilters"
      :filters="filters"
      :tags="tagDefs"
      :result-count="filteredTotal"
      :is-filtered="filtersActive"
      :lead-lookup-enabled="leadLookupEnabled"
      :is-enriching="isEnriching"
      @close="showFilters = false"
      @clear="board.clearFilters()"
      @flag-change="onFlagFilterChange"
    />

    <SettingsModal
      v-if="showSettings"
      :prefs="prefs"
      @close="showSettings = false"
      @save="saveSettings"
    />

    <DayViewModal
      v-if="showDayView"
      :conversations="board.allConversations()"
      :columns="columnDefs"
      :initial-mode="dayMode"
      :is-loading="dayLoading"
      :conversation-url="conversationUrl"
      @close="showDayView = false"
      @export="exportDay"
    />

    <ContactPopup
      v-if="openConversation"
      :key="openConversation.id"
      :conversation="openConversation"
      :columns="columnDefs"
      :tags="tagDefs"
      :prefs="prefs"
      :conversation-url="conversationUrl(openConversation.id)"
      :toggle-tag="toggleTagFromPopup"
      :move-to-stage="moveFromPopup"
      @close="openConversation = null"
    />
  </div>
</template>
