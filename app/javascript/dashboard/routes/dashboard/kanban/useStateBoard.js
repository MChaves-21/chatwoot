/**
 * Kanban por estado — estado da tela.
 *
 * Composable separado do useKanbanBoard: os dois quadros tem ciclos de vida
 * diferentes (um pagina por coluna e confia na contagem do servidor, o outro
 * carrega tudo e conta no cliente). Fundir os dois deixaria as duas metades
 * cheias de `if (mode === 'state')`.
 */

import { ref, reactive, computed } from 'vue';

import StateAPI from './stateApi';
import {
  ATTENDANT_WORKERS,
  MAX_ATTENDANT_LOOKUPS,
  NO_REPLY_TITLE,
  STATE_COLUMNS,
  STATE_INBOX_IDS,
} from './stateConstants';
import {
  assigneeName,
  attendantsFromMessages,
  buildTable,
  classifyAll,
  isCreatedSince,
  isActiveSince,
  startOfDayTs,
} from './stateBoard';

export function useStateBoard() {
  const conversations = ref([]);
  const buckets = reactive({});
  const unclassified = ref([]);

  const isLoading = ref(false);
  const loadError = ref('');
  const progress = ref('');
  const loadedAt = ref(null);

  /**
   * Congelado no momento da carga, nao Date.now() a cada leitura.
   *
   * As faixas de "Em atendimento" dependem da hora atual. Se cada render
   * recalculasse, um card poderia trocar de coluna entre a contagem do topo e
   * o desenho da lista, e a tabela nao bateria com o quadro. Para uma foto
   * mandada ao grupo, discrepancia de um card e o suficiente para alguem
   * perder a confianca no numero.
   */
  const nowMs = ref(Date.now());

  const columns = STATE_COLUMNS;

  // ------------------------------------------------------------ carga

  async function load() {
    isLoading.value = true;
    loadError.value = '';
    progress.value = 'Carregando conversas...';

    try {
      const list = await StateAPI.listAll({
        inboxIds: STATE_INBOX_IDS,
        status: 'all',
        onProgress: ({ inboxId, fetched, allCount }) => {
          progress.value = allCount
            ? `Caixa ${inboxId}: ${fetched}/${allCount}`
            : `Caixa ${inboxId}: ${fetched}`;
        },
      });

      nowMs.value = Date.now();
      conversations.value = list;

      const { byKey, unclassified: rest } = classifyAll(
        list,
        columns,
        nowMs.value
      );
      Object.keys(buckets).forEach(k => delete buckets[k]);
      Object.assign(buckets, byKey);
      unclassified.value = rest;

      loadedAt.value = new Date();
      progress.value = '';
    } catch (err) {
      loadError.value = err.message || 'Falha ao carregar';
    } finally {
      isLoading.value = false;
    }
  }

  // ------------------------------------------------------------ leitura

  function inColumn(key) {
    return buckets[key] || [];
  }

  function countFor(key) {
    return String((buckets[key] || []).length);
  }

  const total = computed(() => conversations.value.length);

  const statusText = computed(() => {
    if (isLoading.value) return progress.value || 'Carregando...';
    if (loadError.value) return `Erro: ${loadError.value}`;
    if (!loadedAt.value) return '';
    return `Atualizado ${loadedAt.value.toLocaleTimeString('pt-BR')}`;
  });

  // -------------------------------------------------- recorte do dia

  const dayStart = ref(startOfDayTs());

  const todayConversations = computed(() =>
    conversations.value.filter(c => isActiveSince(c, dayStart.value))
  );

  const createdToday = computed(
    () => conversations.value.filter(c => isCreatedSince(c, dayStart.value)).length
  );

  /** conversationId -> [nomes de quem enviou mensagem hoje] */
  const attendants = reactive({});
  const isLoadingAttendants = ref(false);
  const attendantsLoadedAt = ref(null);

  /**
   * Descobre quem atendeu, lendo as mensagens das conversas do dia.
   *
   * Custa UMA requisicao por conversa, entao so roda sobre o recorte do dia
   * (~55 em 10/08/2026). Rodar sobre as 501 seriam 501 requisicoes — nunca
   * faca isso.
   *
   * Por que nao usar o campo `assignee`, que sairia de graca: das 55 conversas
   * de hoje, apenas 4 tinham responsavel. O campo mede quem assumiu, e assumir
   * nao e rotina na equipe. O remetente da mensagem mede quem trabalhou.
   */
  async function loadAttendants() {
    const pending = todayConversations.value
      .filter(c => !attendants[c.id])
      .slice(0, MAX_ATTENDANT_LOOKUPS);
    if (!pending.length) {
      attendantsLoadedAt.value = new Date();
      return;
    }

    isLoadingAttendants.value = true;
    let i = 0;
    const worker = async () => {
      while (i < pending.length) {
        const conv = pending[i];
        i += 1;
        try {
          // eslint-disable-next-line no-await-in-loop
          const msgs = await StateAPI.messages(conv.id);
          attendants[conv.id] = attendantsFromMessages(msgs, dayStart.value);
        } catch (e) {
          // Uma conversa que falha nao derruba o resto: ela so nao aparece
          // atribuida a ninguem na tabela do dia.
          attendants[conv.id] = [];
        }
        progress.value = `Lendo atendimentos (${i}/${pending.length})...`;
      }
    };

    await Promise.all(
      Array.from({ length: ATTENDANT_WORKERS }, () => worker())
    );

    isLoadingAttendants.value = false;
    attendantsLoadedAt.value = new Date();
    progress.value = '';
  }

  // ------------------------------------------------------------ tabelas

  /** Estoque: tudo que existe agora, por responsavel. */
  const stockTable = computed(() =>
    buildTable(conversations.value, {
      columns,
      nowMs: nowMs.value,
      rowFor: assigneeName,
    })
  );

  /** Dia: so o que teve atividade hoje, por quem de fato respondeu. */
  const dayTable = computed(() =>
    buildTable(todayConversations.value, {
      columns,
      nowMs: nowMs.value,
      rowFor: conv => {
        const who = attendants[conv.id];
        if (who && who.length) return who;
        // Teve atividade hoje mas nenhuma mensagem de saida: o cliente falou e
        // ninguem respondeu. Linha propria, separada de "nao atribuidas" — sao
        // coisas diferentes, e esta e a que exige acao.
        return NO_REPLY_TITLE;
      },
    })
  );

  return {
    // estado
    conversations,
    buckets,
    unclassified,
    isLoading,
    loadError,
    statusText,
    loadedAt,
    nowMs,
    columns,
    total,
    // acoes
    load,
    inColumn,
    countFor,
    // dia
    dayStart,
    todayConversations,
    createdToday,
    attendants,
    isLoadingAttendants,
    attendantsLoadedAt,
    loadAttendants,
    // tabelas
    stockTable,
    dayTable,
  };
}
