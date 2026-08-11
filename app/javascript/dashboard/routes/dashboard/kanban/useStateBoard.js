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
  DEFAULT_STATE_SCOPE,
  MAX_ATTENDANT_LOOKUPS,
  NO_REPLY_TITLE,
  STATE_COLUMNS,
  STATE_INBOX_IDS,
  STATE_SCOPES,
} from './stateConstants';
import {
  assigneeName,
  attendantsFromMessages,
  buildTable,
  classifyAll,
  isCreatedSince,
  isActiveSince,
  scopeCutoffTs,
  startOfDayTs,
} from './stateBoard';

export function useStateBoard() {
  const conversations = ref([]);

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
      // A classificacao nao acontece mais aqui: virou computed, para que trocar
      // o periodo reclassifique sozinho sem uma requisicao nova (ver `scope`).

      loadedAt.value = new Date();
      progress.value = '';
    } catch (err) {
      loadError.value = err.message || 'Falha ao carregar';
    } finally {
      isLoading.value = false;
    }
  }

  // ------------------------------------------------------- recorte de periodo

  /**
   * Periodo em foco: 'hoje' | '7d' | '30d' | 'tudo'.
   *
   * Custa zero requisicao. A base inteira ja esta em memoria desde o load(), e
   * o que muda e so qual fatia dela vai para o classifyAll. Foi por isso que o
   * seletor virou quatro opcoes em vez do botao unico "so hoje" que o usuario
   * pediu: com os dados ja carregados, 7d e 30d saem de graca — e sao eles que
   * resolvem a coluna "+7d", onde estao ~268 dos 503 cards.
   */
  const scope = ref(DEFAULT_STATE_SCOPE);
  const scopes = STATE_SCOPES;

  const scopeCutoff = computed(() => {
    const def = STATE_SCOPES.find(s => s.key === scope.value);
    return scopeCutoffTs(def && def.days, new Date(nowMs.value));
  });

  const scoped = computed(() =>
    scopeCutoff.value
      ? conversations.value.filter(c => isActiveSince(c, scopeCutoff.value))
      : conversations.value
  );

  // ------------------------------------------------------------ leitura

  /**
   * Classificacao derivada, nao armazenada.
   *
   * Antes era um `reactive` preenchido no load(). Virou computed porque agora
   * ha duas entradas que mudam sem recarregar (a lista e o periodo), e manter
   * as duas em sincronia na mao e exatamente o tipo de bug que faz o contador
   * do topo discordar da lista de baixo.
   */
  const classified = computed(() =>
    classifyAll(scoped.value, columns, nowMs.value)
  );

  const buckets = computed(() => classified.value.byKey);
  const unclassified = computed(() => classified.value.unclassified);

  function inColumn(key) {
    return buckets.value[key] || [];
  }

  function countFor(key) {
    return String((buckets.value[key] || []).length);
  }

  /** Total da base carregada — nao muda com o periodo, e o denominador. */
  const total = computed(() => conversations.value.length);

  /** Total dentro do periodo em foco. */
  const scopedTotal = computed(() => scoped.value.length);

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

  /**
   * Estoque: tudo que existe agora, por responsavel.
   *
   * De proposito sobre `conversations` e nao sobre `scoped`: esta tabela e
   * fotografada e mandada no grupo duas vezes por dia, e "estoque" ali sempre
   * significou a base inteira. Se ela passasse a seguir o seletor de periodo, a
   * mesma foto teria significados diferentes conforme o botao que estivesse
   * ativo quando alguem apertou "Copiar imagem".
   */
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
    // periodo
    scope,
    scopes,
    scopeCutoff,
    scoped,
    scopedTotal,
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
