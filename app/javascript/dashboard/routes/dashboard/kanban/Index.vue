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

import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useStore } from 'vuex';
import { useAlert } from 'dashboard/composables';
import { frontendURL } from 'dashboard/helper/URLHelper';

import KanbanColumn from './components/KanbanColumn.vue';
import ContactPopup from './components/ContactPopup.vue';
import DayViewModal from './components/DayViewModal.vue';
import FiltersModal from './components/FiltersModal.vue';
import SettingsModal from './components/SettingsModal.vue';
import StateBoard from './components/StateBoard.vue';
import DailyTableModal from './components/DailyTableModal.vue';

import { useKanbanBoard } from './useKanbanBoard';
import { useStateBoard } from './useStateBoard';
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
  funnels,
  activeFunnelId,
  activeFunnel,
} = board;

const isSwitchingFunnel = ref(false);

// ------------------------------------------------- navegacao horizontal

/**
 * Setas para andar de coluna em coluna nos funis de etiqueta.
 *
 * Auxilio Acidente tem 13 colunas e BPC tem 15; na largura de tela normal
 * cabem 4 ou 5. Chegar na ultima etapa exigia arrastar a barra de rolagem por
 * baixo, que e o alvo mais dificil de acertar da tela.
 *
 * Um passo = largura da coluna (290) + o gap-3 (12). Numero fixo porque a
 * largura da coluna e fixa no KanbanColumn; se ela virar variavel, isto aqui
 * precisa medir o primeiro filho em vez de assumir.
 */
const COLUMN_STEP = 302;

const boardScroller = ref(null);
const canScrollLeft = ref(false);
const canScrollRight = ref(false);

const syncScrollState = () => {
  const el = boardScroller.value;
  if (!el) {
    canScrollLeft.value = false;
    canScrollRight.value = false;
    return;
  }
  canScrollLeft.value = el.scrollLeft > 1;
  // 1px de folga: com zoom do navegador as contas nao fecham exatamente e o
  // botao ficaria habilitado no fim da rolagem.
  canScrollRight.value = el.scrollLeft + el.clientWidth < el.scrollWidth - 1;
};

const scrollColumns = dir => {
  const el = boardScroller.value;
  if (!el) return;
  el.scrollBy({ left: dir * COLUMN_STEP, behavior: 'smooth' });
};

// Trocar de funil muda a quantidade de colunas, entao o "da para ir para a
// direita?" precisa ser recalculado depois do render.
watch([activeFunnelId, columnDefs], () => {
  nextTick(syncScrollState);
});

/**
 * Quadro por estado. Estado proprio, separado do quadro de etiquetas: os dois
 * tem ciclos de vida opostos (um pagina por coluna e confia na contagem do
 * servidor, o outro carrega tudo e conta no cliente).
 */
const stateBoard = useStateBoard();
const showDailyTable = ref(false);

const isStateMode = computed(() => activeFunnel.value.mode === 'state');

/**
 * Carrega so quando o funil fica ativo. Sao ~21 requisicoes; nao vale cobrar
 * isso de quem nunca abre esta aba.
 */
const ensureStateLoaded = () => {
  if (isStateMode.value && !stateBoard.loadedAt.value) stateBoard.load();
};

const onFunnelChange = async id => {
  if (id === activeFunnelId.value) return;
  isSwitchingFunnel.value = true;
  try {
    // setFunnel dispara loadAll() no quadro de etiquetas. No modo estado isso
    // nao carrega nada — o funil tem `columns: []` — e o StateBoard cuida da
    // propria carga logo abaixo.
    await board.setFunnel(id);
    ensureStateLoaded();
  } finally {
    isSwitchingFunnel.value = false;
  }
};

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

onMounted(() => {
  if (isStateMode.value) ensureStateLoaded();
  else board.loadAll();
  // As colunas so existem depois do primeiro render; sem o nextTick as setas
  // nasceriam escondidas mesmo com 15 colunas na tela.
  nextTick(syncScrollState);
  window.addEventListener('resize', syncScrollState);
});

onBeforeUnmount(() => {
  window.removeEventListener('resize', syncScrollState);
});

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
      // O funil vai no nome do arquivo: com dois quadros, dois "kanban-panorama"
      // na pasta de downloads sao indistinguiveis.
      prefix: `kanban-${activeFunnel.value.id}-${
        filtersActive.value ? 'filtrado' : 'panorama'
      }`,
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
      prefix: `kanban-${activeFunnel.value.id}-${
        mode === 'updated' ? 'atualizados' : 'criados'
      }`,
      columns: columnDefs.value,
      tags: tagDefs.value,
      stampOverride: date,
    });
    useAlert(`Excel gerado (${list.length} cartões).`);
  } catch (err) {
    useAlert(`Falha no Excel: ${err.message}`);
  }
};

/**
 * Compacto de proposito. Com o seletor de funil no cabecalho, os rotulos
 * antigos ("Exportar Excel", "Atualizados hoje") em text-sm nao cabiam mais na
 * largura util e o botao Configuracoes quebrava para uma segunda linha sozinho.
 * Os rotulos foram encurtados e o title= carrega o texto completo.
 */
const BTN =
  'px-2.5 py-1.5 text-xs whitespace-nowrap rounded-lg border transition-colors border-n-weak text-n-slate-12 hover:bg-n-alpha-2 disabled:opacity-50';
</script>

<template>
  <div class="flex flex-col w-full h-full bg-n-background">
    <header
      class="flex flex-wrap gap-2 items-center px-4 py-2.5 border-b border-n-weak"
    >
      <h1 class="text-base font-bold whitespace-nowrap text-n-slate-12">
        Kanban
      </h1>

      <div
        class="flex overflow-hidden rounded-lg border shrink-0 border-n-weak"
        role="group"
        aria-label="Funil"
      >
        <button
          v-for="f in funnels"
          :key="f.id"
          type="button"
          :disabled="isSwitchingFunnel"
          :aria-pressed="f.id === activeFunnelId"
          :class="[
            'px-2.5 py-1.5 text-xs whitespace-nowrap transition-colors disabled:opacity-50',
            f.id === activeFunnelId
              ? 'bg-n-brand text-white'
              : 'text-n-slate-12 hover:bg-n-alpha-2',
          ]"
          @click="onFunnelChange(f.id)"
        >
          {{ f.title }}
        </button>
      </div>

      <span class="flex-1 min-w-0" />

      <span
        class="overflow-hidden text-xs whitespace-nowrap text-ellipsis text-n-slate-11 max-w-[150px]"
        :title="statusText"
      >
        {{ statusText }}
      </span>

      <!--
        Os botoes abaixo trabalham sobre etiquetas de funil, que nao existem no
        quadro por estado. O StateBoard traz os seus proprios.
      -->
      <template v-if="!isStateMode">
        <button :class="BTN" @click="showFilters = true">
          Filtros<template v-if="filterCount"> ({{ filterCount }})</template>
        </button>
        <button
          :class="BTN"
          :disabled="isExporting"
          title="Exportar para Excel"
          @click="exportBoard"
        >
          {{ isExporting ? 'Gerando...' : 'Excel' }}
        </button>
        <button
          :class="BTN"
          title="Conversas criadas em um dia"
          @click="openDayView('created')"
        >
          Criados
        </button>
        <button
          :class="BTN"
          title="Conversas atualizadas em um dia"
          @click="openDayView('updated')"
        >
          Atualizados
        </button>
        <button :class="BTN" @click="board.loadAll()">Recarregar</button>
      </template>
      <button :class="BTN" @click="showSettings = true">Configurações</button>
    </header>

    <!-- Quadro por estado: somente leitura, carga propria -->
    <StateBoard
      v-if="isStateMode"
      :board="stateBoard"
      :conversation-url="conversationUrl"
      @open-table="showDailyTable = true"
    />

    <!-- Quadro de etiquetas: comportamento original, com navegacao horizontal -->
    <div v-else class="flex relative flex-col flex-1 min-h-0">
      <!--
        As setas flutuam sobre as colunas em vez de ocupar linha propria: com
        13-15 colunas, cada pixel de largura util conta. Ficam escondidas
        quando nao ha para onde ir, para nao sugerir conteudo que nao existe.
      -->
      <button
        v-if="canScrollLeft"
        class="flex absolute left-1 top-1/2 z-20 justify-center items-center -translate-y-1/2 rounded-full border shadow-md size-8 bg-n-background border-n-weak text-n-slate-12 hover:bg-n-alpha-2"
        title="Coluna anterior"
        @click="scrollColumns(-1)"
      >
        ‹
      </button>
      <button
        v-if="canScrollRight"
        class="flex absolute right-1 top-1/2 z-20 justify-center items-center -translate-y-1/2 rounded-full border shadow-md size-8 bg-n-background border-n-weak text-n-slate-12 hover:bg-n-alpha-2"
        title="Próxima coluna"
        @click="scrollColumns(1)"
      >
        ›
      </button>

      <div
        ref="boardScroller"
        class="flex overflow-x-auto overflow-y-hidden flex-1 gap-3 items-start p-3.5"
        @scroll.passive="syncScrollState"
      >
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
    </div>

    <DailyTableModal
      v-if="showDailyTable"
      :day-table="stateBoard.dayTable.value"
      :stock-table="stateBoard.stockTable.value"
      :created-today="stateBoard.createdToday.value"
      :today-count="stateBoard.todayConversations.value.length"
      :total-count="stateBoard.total.value"
      :is-loading-attendants="stateBoard.isLoadingAttendants.value"
      :load-attendants="stateBoard.loadAttendants"
      @close="showDailyTable = false"
    />

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
