/**
 * Kanban Comercial — estado do quadro.
 *
 * Concentra colunas, paginacao, filtros, cache de leads e as duas operacoes
 * de escrita (mover de etapa e alternar tag). Os componentes so leem daqui.
 */

import { ref, reactive, computed } from 'vue';
import KanbanAPI, { fetchLead } from './api';
import {
  COLUMN_CONCURRENCY,
  DEFAULT_PREFS,
  DISQUALIFIED_LABELS,
  FUNNELS,
  LS_KEY,
  MANUAL_LABEL,
  MAX_PAGES_PER_COLUMN,
  NO_AUTOMATION_LABEL,
  UNSTAGED_LABEL,
  findFunnel,
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
    if (raw) {
      const saved = JSON.parse(raw);
      // As colunas viviam aqui ate 06/08/2026 e agora sao preset por funil.
      // Descartar as salvas e obrigatorio, nao higiene: um navegador com o
      // preset antigo em cache montaria um quadro de 11 colunas de Auxilio
      // Acidente por cima do funil BPC.
      delete saved.columns;
      return { ...DEFAULT_PREFS, ...saved };
    }
  } catch (e) {
    // preferencia corrompida nao deve impedir o quadro de abrir
  }
  return { ...DEFAULT_PREFS };
}

export function useKanbanBoard() {
  const prefs = reactive(loadPrefs());
  const filters = reactive({ ...EMPTY_FILTERS });

  const activeFunnelId = ref(findFunnel(prefs.funnelId).id);
  const activeFunnel = computed(() => findFunnel(activeFunnelId.value));

  /** label -> { page, total, done, loaded[] } */
  const columns = reactive({});
  const leadCache = reactive({});

  const isLoading = ref(false);
  const statusText = ref('');
  const errors = reactive({});

  const columnDefs = computed(() => activeFunnel.value.columns || []);
  const tagDefs = computed(() => prefs.tags || []);

  /**
   * So as etapas REAIS do funil ativo. A coluna "Sem etapa" e sintetica e
   * precisa ficar de fora: moveToStage usa esta lista para decidir o que
   * apagar, e UNSTAGED_LABEL nao existe como etiqueta no Chatwoot.
   *
   * Ser derivada do funil ativo tambem e o que impede um quadro de apagar a
   * etapa do outro.
   */
  const stageLabels = computed(() =>
    columnDefs.value.map(c => c.label).filter(l => l !== UNSTAGED_LABEL)
  );
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

    // A coluna sintetica le a caixa inteira de uma vez e filtra no cliente.
    // Nao pagina: ver o comentario de listWithoutStage em api.js.
    if (label === UNSTAGED_LABEL) {
      try {
        const { payload, total } = await KanbanAPI.listWithoutStage({
          inboxId: activeFunnel.value.inboxId,
          status: prefs.status,
          stageLabels: stageLabels.value,
        });
        st.loaded = payload;
        st.total = total;
        st.page = 1;
        st.done = true;
        delete errors[label];
      } catch (err) {
        errors[label] = err.message || 'Falha ao carregar';
        throw err;
      }
      return;
    }

    st.page += 1;
    try {
      const { payload, total } = await KanbanAPI.listByLabel({
        label,
        page: st.page,
        status: prefs.status,
        inboxId: activeFunnel.value.inboxId,
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

  /**
   * A ordem em que as colunas sao CARREGADAS, que nao e a ordem em que elas
   * aparecem na tela — 14/08/2026.
   *
   * A coluna sintetica "Sem etapa" vai por ultimo. Ela nao da para pedir por
   * etiqueta (a API do Chatwoot nao sabe filtrar por ausencia), entao le a
   * CAIXA INTEIRA e filtra no cliente: na caixa 9 sao 593 conversas = 24
   * requisicoes, contra 1 de cada coluna de etiqueta.
   *
   * Ela e a PRIMEIRA coluna do funil BPC. Carregar na ordem da tela significava
   * segurar as outras 16 colunas ate ela terminar — o quadro passava a maior
   * parte do tempo de carga sem mostrar card nenhum, gastando esse tempo na
   * coluna que menos card tem. Trocar a ordem nao economiza uma requisicao
   * sequer; muda so QUANDO a tela comeca a ficar util, que era a reclamacao.
   */
  function loadOrder() {
    const defs = columnDefs.value;
    return [
      ...defs.filter(c => c.label !== UNSTAGED_LABEL),
      ...defs.filter(c => c.label === UNSTAGED_LABEL),
    ];
  }

  /**
   * Executa `job` sobre a fila com no maximo COLUMN_CONCURRENCY em voo.
   *
   * Um erro em uma coluna nao derruba as outras: ja fica registrado em
   * errors[label] e a coluna aparece marcada na tela.
   */
  async function runPool(queue, job, onDone = null) {
    let next = 0;
    let finished = 0;
    const worker = async () => {
      while (next < queue.length) {
        const item = queue[next];
        next += 1;
        try {
          // eslint-disable-next-line no-await-in-loop
          await job(item);
        } catch (e) {
          // erro por coluna ja fica registrado em errors[label]
        }
        finished += 1;
        if (onDone) onDone(finished, queue.length);
      }
    };
    const width = Math.min(COLUMN_CONCURRENCY, queue.length) || 1;
    await Promise.all(Array.from({ length: width }, () => worker()));
  }

  async function loadAll() {
    isLoading.value = true;
    resetColumns();

    const queue = loadOrder();
    // Contador em vez de "Carregando...": com 17 colunas, saber que faltam 3 e
    // a diferenca entre esperar e achar que travou.
    statusText.value = `Carregando 0/${queue.length}...`;
    await runPool(
      queue,
      col => loadColumn(col.label),
      (done, total) => {
        statusText.value = `Carregando ${done}/${total}...`;
      }
    );

    isLoading.value = false;
    statusText.value = `Atualizado ${new Date().toLocaleTimeString('pt-BR')}`;
  }

  /**
   * Pagina todas as colunas ate o fim. Usado por Excel e pelas telas do dia.
   * E caro: ate MAX_PAGES_PER_COLUMN requisicoes por coluna.
   */
  async function loadEverything() {
    const queue = loadOrder();
    statusText.value = `Carregando todas as conversas 0/${queue.length}...`;

    // Colunas em paralelo (ate COLUMN_CONCURRENCY), paginas de cada coluna em
    // sequencia. E a operacao mais cara do quadro — ate MAX_PAGES_PER_COLUMN
    // requisicoes por coluna — e e a que a equipe espera as 12h e as 17h30.
    await runPool(
      queue,
      async col => {
        const st = columns[col.label];
        if (!st) return;
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
      },
      (done, total) => {
        statusText.value = `Carregando todas as conversas ${done}/${total}...`;
      }
    );

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
   * Desde 11/08/2026, cair numa etapa de descarte tambem aplica
   * NO_AUTOMATION_LABEL: quem foi desqualificado nao pode continuar recebendo
   * mensagem do robo. Ver DISQUALIFIED_LABELS em constants.js.
   *
   * Desde 12/08/2026 tambem RESOLVE a conversa. O pedido foi "lead
   * desqualificado sai da lista de conversas e fica so no kanban", e resolver
   * e o unico jeito de conseguir isso sem tocar na lista de conversas do
   * Chatwoot original: a lista abre filtrada por Abertas, entao a conversa
   * some de la sozinha e continua no quadro, que le com status=all.
   *
   * Duas consequencias que quem mexer nisso precisa saber:
   *   - a conversa NAO some de vez; quem filtrar por "Todas" continua vendo;
   *   - se o cliente responder, o Chatwoot reabre a conversa sozinho e ela
   *     volta para a lista. E o comportamento certo (quem foi descartado e
   *     voltou a falar merece ser visto), mas nao e "sumir para sempre".
   *
   * Atualiza a tela antes da resposta da API e desfaz se ela falhar.
   */
  async function moveToStage(conv, fromLabel, toLabel) {
    if (!conv || fromLabel === toLabel) return { ok: true };

    const before = convLabels(conv).slice();
    const kept = before.filter(l => !stageLabels.value.includes(l));
    // Arrastar de volta para "Sem etapa" e uma operacao legitima: significa
    // "classifiquei errado, tira daqui". Nesse caso nao ha etiqueta a aplicar,
    // so as de etapa a remover — UNSTAGED_LABEL nunca vai para a API.
    const after =
      toLabel === UNSTAGED_LABEL ? kept.slice() : kept.concat([toLabel]);
    if (!after.includes(MANUAL_LABEL)) after.push(MANUAL_LABEL);

    // Desliga o atendimento automatico ao descartar. So acrescenta: sair de uma
    // etapa de descarte NAO religa o robo, porque a etiqueta tambem e usada
    // fora do quadro (222 conversas em 11/08) e religar por engano manda
    // mensagem automatica para quem ja estava em atendimento humano.
    if (
      DISQUALIFIED_LABELS.includes(toLabel) &&
      !after.includes(NO_AUTOMATION_LABEL)
    ) {
      after.push(NO_AUTOMATION_LABEL);
    }

    // Descartar tambem encerra a conversa. Guardado antes do try porque o
    // desfazer precisa saber o status anterior.
    const isDiscard = DISQUALIFIED_LABELS.includes(toLabel);
    const beforeStatus = conv.status;
    const shouldResolve = isDiscard && beforeStatus !== 'resolved';

    const fromSt = columns[fromLabel];
    const toSt = columns[toLabel];

    if (fromSt) {
      fromSt.loaded = fromSt.loaded.filter(c => c.id !== conv.id);
      if (fromSt.total !== null) fromSt.total = Math.max(0, fromSt.total - 1);
    }
    conv.labels = after;
    if (shouldResolve) conv.status = 'resolved';
    if (toSt) {
      toSt.loaded.unshift(conv);
      if (toSt.total !== null) toSt.total += 1;
    }

    try {
      await KanbanAPI.updateLabels(conv.id, after);
      if (shouldResolve) {
        try {
          await KanbanAPI.toggleStatus(conv.id, 'resolved');
        } catch (statusErr) {
          /*
           * A etiqueta ja gravou; so o encerramento falhou. Desfazer o
           * movimento inteiro aqui seria pior que o problema — o card voltaria
           * para a coluna antiga enquanto a etiqueta de descarte continuaria
           * gravada no Chatwoot, e as duas telas passariam a discordar.
           *
           * Entao o card fica onde esta, o status local volta ao que era, e
           * quem chamou recebe um aviso especifico: o descarte valeu, so a
           * conversa continua aberta na lista.
           */
          conv.status = beforeStatus;
          return {
            ok: true,
            warning:
              'Etapa gravada, mas nao consegui encerrar a conversa — ela continua na lista de abertas.',
          };
        }
      }
      return { ok: true };
    } catch (err) {
      if (toSt) {
        toSt.loaded = toSt.loaded.filter(c => c.id !== conv.id);
        if (toSt.total !== null) toSt.total = Math.max(0, toSt.total - 1);
      }
      conv.labels = before;
      conv.status = beforeStatus;
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

  /**
   * Troca de funil. Zera colunas E cache de leads antes de recarregar: as duas
   * estruturas sao indexadas por etiqueta e por telefone, sem nocao de funil, e
   * sobreviveriam a troca misturando os dois quadros.
   */
  async function setFunnel(id) {
    const next = findFunnel(id);
    if (next.id === activeFunnelId.value) return;
    activeFunnelId.value = next.id;
    prefs.funnelId = next.id;
    savePrefs();
    Object.keys(columns).forEach(k => delete columns[k]);
    Object.keys(leadCache).forEach(k => delete leadCache[k]);
    Object.keys(errors).forEach(k => delete errors[k]);
    clearFilters();
    await loadAll();
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
    // funis
    funnels: FUNNELS,
    activeFunnelId,
    activeFunnel,
    setFunnel,
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
