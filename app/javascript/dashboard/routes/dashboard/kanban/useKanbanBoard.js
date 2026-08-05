/**
 * Kanban Comercial — estado do quadro.
 *
 * Concentra colunas, paginacao, filtros, cache de leads e as duas operacoes
 * de escrita (mover de etapa e alternar tag). Os componentes so leem daqui.
 */

import { ref, reactive, computed } from 'vue';
import KanbanAPI, { fetchLead } from './api';
import {
  DEFAULT_PREFS,
  LS_KEY,
  MANUAL_LABEL,
  MAX_PAGES_PER_COLUMN,
} from './constants';
import {
  EMPTY_FILTERS,
  convLabels,
  convPhone,
  filtersActive as calcFiltersActive,
  passesFilter,
} from './helpers';

function loadPrefs() {
  try {
    const raw = window.localStorage.getItem(LS_KEY);
    if (raw) return { ...DEFAULT_PREFS, ...JSON.parse(raw) };
  } catch (e) {
    // preferencia corrompida nao deve impedir o quadro de abrir
  }
  return { ...DEFAULT_PREFS };
}

export function useKanbanBoard() {
  const prefs = reactive(loadPrefs());
  const filters = reactive({ ...EMPTY_FILTERS });

  /** label -> { page, total, done, loaded[] } */
  const columns = reactive({});
  const leadCache = reactive({});

  const isLoading = ref(false);
  const statusText = ref('');
  const errors = reactive({});

  const columnDefs = computed(() => prefs.columns || []);
  const tagDefs = computed(() => prefs.tags || []);
  const stageLabels = computed(() => columnDefs.value.map(c => c.label));
  const filtersActive = computed(() => calcFiltersActive(filters));

  function savePrefs() {
    try {
      window.localStorage.setItem(LS_KEY, JSON.stringify(prefs));
    } catch (e) {
      // modo privativo do navegador: seguir sem persistir
    }
  }

  function resetColumns() {
    Object.keys(columns).forEach(k => delete columns[k]);
    columnDefs.value.forEach(col => {
      columns[col.label] = { page: 0, total: null, done: false, loaded: [] };
    });
  }

  function visibleIn(label) {
    const st = columns[label];
    if (!st) return [];
    if (!filtersActive.value) return st.loaded;
    return st.loaded.filter(c => passesFilter(c, filters, leadCache));
  }

  function countLabel(label) {
    const st = columns[label];
    if (!st) return '...';
    const total = st.total === null ? st.loaded.length : st.total;
    if (!filtersActive.value) return String(total);
    return `${visibleIn(label).length}/${total}`;
  }

  function hasMore(label) {
    const st = columns[label];
    if (!st) return false;
    return !st.done && (st.total === null || st.loaded.length < st.total);
  }

  async function loadColumn(label) {
    const st = columns[label];
    if (!st || st.done) return;

    st.page += 1;
    try {
      const { payload, total } = await KanbanAPI.listByLabel({
        label,
        page: st.page,
        status: prefs.status,
      });
      st.total = total;
      const seen = new Set(st.loaded.map(c => c.id));
      payload.forEach(c => {
        if (!seen.has(c.id)) st.loaded.push(c);
      });
      // Nao comparar com um tamanho de pagina fixo: o Chatwoot pagina com
      // CONVERSATION_RESULTS_PER_PAGE, que e 25 por padrao mas e variavel de
      // ambiente. Se ela ficar abaixo de 25, uma pagina cheia seria lida como
      // "acabou" e a coluna truncaria em silencio. O total do meta.all_count e
      // confiavel: o finder aplica o filtro de etiqueta antes de contar.
      st.done =
        payload.length === 0 ||
        (st.total !== null && st.loaded.length >= st.total);
      delete errors[label];
    } catch (err) {
      st.page -= 1;
      errors[label] = err.message || 'Falha ao carregar';
      throw err;
    }
  }

  async function loadAll() {
    isLoading.value = true;
    statusText.value = 'Carregando...';
    resetColumns();
    // Sequencial de proposito: em paralelo, 11 colunas disparam 11 chamadas
    // simultaneas e esbarram no rate limit do Chatwoot.
    for (const col of columnDefs.value) {
      try {
        // eslint-disable-next-line no-await-in-loop
        await loadColumn(col.label);
      } catch (e) {
        // erro por coluna ja fica registrado em errors[label]
      }
    }
    isLoading.value = false;
    statusText.value = `Atualizado ${new Date().toLocaleTimeString('pt-BR')}`;
  }

  /**
   * Pagina todas as colunas ate o fim. Usado por Excel e pelas telas do dia.
   * E caro: ate MAX_PAGES_PER_COLUMN requisicoes por coluna.
   */
  async function loadEverything() {
    statusText.value = 'Carregando todas as conversas...';
    for (const col of columnDefs.value) {
      const st = columns[col.label];
      if (!st) continue;
      let guard = 0;
      while (!st.done && guard < MAX_PAGES_PER_COLUMN) {
        try {
          // eslint-disable-next-line no-await-in-loop
          await loadColumn(col.label);
        } catch (e) {
          // Igual ao loadAll: uma coluna que falha nao derruba as outras. O
          // erro ja esta em errors[label] e a coluna aparece marcada na tela.
          break;
        }
        guard += 1;
      }
    }
    statusText.value = '';
  }

  function allConversations() {
    const seen = new Set();
    const out = [];
    columnDefs.value.forEach(col => {
      const st = columns[col.label];
      if (!st) return;
      st.loaded.forEach(c => {
        if (!seen.has(c.id)) {
          seen.add(c.id);
          out.push(c);
        }
      });
    });
    return out;
  }

  // ------------------------------------------------------------ leads

  async function ensureLead(phone) {
    if (!phone) return null;
    if (Object.prototype.hasOwnProperty.call(leadCache, phone))
      return leadCache[phone];
    const lead = await fetchLead({
      url: prefs.leadUrl,
      secret: prefs.secret,
      phone,
    });
    leadCache[phone] = lead;
    return lead;
  }

  /** Busca os leads que faltam, com concorrencia limitada. */
  async function enrichLeads() {
    const pending = [
      ...new Set(
        allConversations()
          .map(convPhone)
          .filter(p => p && !Object.prototype.hasOwnProperty.call(leadCache, p))
      ),
    ];
    if (!pending.length) return;

    statusText.value = `Buscando dados dos leads (${pending.length})...`;
    let i = 0;
    const worker = async () => {
      while (i < pending.length) {
        const phone = pending[i];
        i += 1;
        // eslint-disable-next-line no-await-in-loop
        await ensureLead(phone);
      }
    };
    await Promise.all([worker(), worker(), worker(), worker()]);
    statusText.value = '';
  }

  // ------------------------------------------------------------ escrita

  /**
   * Move a conversa de etapa. Troca so as etiquetas de etapa e preserva o
   * resto — inclusive atendimento_humanizado, de que o fluxo do n8n depende.
   * Acrescenta MANUAL_LABEL para marcar que a mudanca veio de uma pessoa.
   *
   * Atualiza a tela antes da resposta da API e desfaz se ela falhar.
   */
  async function moveToStage(conv, fromLabel, toLabel) {
    if (!conv || fromLabel === toLabel) return { ok: true };

    const before = convLabels(conv).slice();
    const kept = before.filter(l => !stageLabels.value.includes(l));
    const after = kept.concat([toLabel]);
    if (!after.includes(MANUAL_LABEL)) after.push(MANUAL_LABEL);

    const fromSt = columns[fromLabel];
    const toSt = columns[toLabel];

    if (fromSt) {
      fromSt.loaded = fromSt.loaded.filter(c => c.id !== conv.id);
      if (fromSt.total !== null) fromSt.total = Math.max(0, fromSt.total - 1);
    }
    conv.labels = after;
    if (toSt) {
      toSt.loaded.unshift(conv);
      if (toSt.total !== null) toSt.total += 1;
    }

    try {
      await KanbanAPI.updateLabels(conv.id, after);
      return { ok: true };
    } catch (err) {
      if (toSt) {
        toSt.loaded = toSt.loaded.filter(c => c.id !== conv.id);
        if (toSt.total !== null) toSt.total = Math.max(0, toSt.total - 1);
      }
      conv.labels = before;
      if (fromSt) {
        fromSt.loaded.unshift(conv);
        if (fromSt.total !== null) fromSt.total += 1;
      }
      return { ok: false, error: err.message || 'Falha ao mover' };
    }
  }

  async function toggleTag(conv, tagLabel) {
    const before = convLabels(conv).slice();
    const after = before.includes(tagLabel)
      ? before.filter(l => l !== tagLabel)
      : before.concat([tagLabel]);
    try {
      await KanbanAPI.updateLabels(conv.id, after);
      conv.labels = after;
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err.message || 'Falha ao salvar tag' };
    }
  }

  function clearFilters() {
    Object.assign(filters, EMPTY_FILTERS);
  }

  return {
    // estado
    prefs,
    filters,
    columns,
    leadCache,
    isLoading,
    statusText,
    errors,
    // derivados
    columnDefs,
    tagDefs,
    stageLabels,
    filtersActive,
    // leitura
    visibleIn,
    countLabel,
    hasMore,
    loadColumn,
    loadAll,
    loadEverything,
    allConversations,
    // leads
    ensureLead,
    enrichLeads,
    // escrita
    moveToStage,
    toggleTag,
    // util
    savePrefs,
    clearFilters,
  };
}
