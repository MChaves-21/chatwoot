/**
 * Kanban por estado — acesso a API.
 *
 * Nao mexe em api.js de proposito: estende ApiClient do mesmo jeito que
 * KanbanAPI faz, entao herda a autenticacao da sessao do agente logado e o
 * account id da rota. Zero diff no arquivo existente.
 */

/* global axios */

import ApiClient from '../../../api/ApiClient';
import { MAX_PAGES_STATE } from './stateConstants';

class StateBoardAPI extends ApiClient {
  constructor() {
    super('conversations', { accountScoped: true });
  }

  /**
   * Uma pagina crua de conversas de uma caixa.
   * `status=all` porque o quadro precisa das resolvidas tambem — com
   * status=open as colunas Resolvido e Fechado abririam vazias sem explicacao.
   */
  async page({ inboxId, page = 1, status = 'all' }) {
    const params = new URLSearchParams();
    params.set('status', status);
    params.set('page', String(page));
    if (inboxId) params.set('inbox_id', String(inboxId));

    const res = await axios.get(`${this.url}?${params.toString()}`);
    const body = res.data || {};
    const data = body.data || body;
    return {
      payload: data.payload || [],
      allCount: (data.meta || {}).all_count ?? null,
    };
  }

  /**
   * Todas as conversas das caixas informadas.
   *
   * Sequencial de proposito. O comentario em useKanbanBoard.loadAll ja
   * registra que disparar as colunas em paralelo esbarra no rate limit do
   * Chatwoot; aqui vale o mesmo.
   *
   * Nao ha paginacao por coluna neste quadro, e nao e preguica: a spec exige
   * que cada conversa apareca em UMA coluna so (ver ordem de prioridade em
   * stateConstants). Com exclusao mutua o meta.all_count do servidor deixa de
   * servir como contagem de coluna — uma conversa resolvida E desqualificada
   * seria contada nas duas. Por isso a classificacao e a contagem sao no
   * cliente, sobre a base inteira.
   *
   * Custo em 10/08/2026: 501 conversas, ~21 requisicoes.
   */
  async listAll({ inboxIds = [], status = 'all', onProgress = null } = {}) {
    const out = [];
    const seen = new Set();

    for (const inboxId of inboxIds) {
      let fetched = 0;
      let allCount = null;

      for (let page = 1; page <= MAX_PAGES_STATE; page += 1) {
        // eslint-disable-next-line no-await-in-loop
        const res = await this.page({ inboxId, page, status });
        if (!res.payload.length) break;

        res.payload.forEach(c => {
          if (!seen.has(c.id)) {
            seen.add(c.id);
            out.push(c);
          }
        });

        // Contar o acumulado, nunca page * tamanho de pagina: o Chatwoot
        // pagina com CONVERSATION_RESULTS_PER_PAGE (25 por padrao, mas e
        // variavel de ambiente) e a ultima pagina vem curta. A multiplicacao
        // pararia cedo e esconderia conversas em silencio.
        fetched += res.payload.length;
        allCount = res.allCount ?? allCount;
        if (onProgress) onProgress({ inboxId, fetched, allCount });
        if (allCount != null && fetched >= allCount) break;
      }
    }

    return out;
  }

  /** Mensagens da conversa, ja desembrulhadas. */
  async messages(id) {
    const res = await axios.get(`${this.url}/${id}/messages`);
    const body = res.data || {};
    const data = body.data || body;
    return data.payload || data || [];
  }
}

export default new StateBoardAPI();
