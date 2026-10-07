/* global axios */
/**
 * Dashboard IA — acesso a API.
 *
 * So leitura, e so a API do proprio Chatwoot, com a sessao de quem esta
 * logado (mesmo arranjo do Kanban: estende ApiClient). Nao ha webhook, n8n
 * nem segredo aqui.
 *
 * Duas leituras:
 *
 *   1. scan()        todas as conversas das caixas dos funis, reduzidas a
 *                    linhas (metrics.toRow). E a base de tudo no painel.
 *   2. signedDates() QUANDO cada contrato foi assinado. A etiqueta nao guarda
 *                    data; quem guarda e a mensagem de atividade que o
 *                    Chatwoot grava no historico ("Fulano adicionou
 *                    contrato_assinado"). So e lida para conversas que ja
 *                    estao em contrato assinado ou alem.
 */

import ApiClient from '../../../api/ApiClient';
import {
  MAX_HISTORY_PAGES,
  MAX_PAGES_PER_INBOX,
  SCAN_CONCURRENCY,
} from './constants';
import { toRow } from './metrics';

/** Roda `worker` sobre `items` com no maximo `limit` em paralelo. */
async function pool(items, limit, worker) {
  let next = 0;
  const run = async () => {
    while (next < items.length) {
      const i = next;
      next += 1;
      // eslint-disable-next-line no-await-in-loop
      await worker(items[i], i);
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, run)
  );
}

/**
 * Etiquetas ADICIONADAS numa mensagem de atividade, ou [] se a mensagem nao e
 * de etiqueta adicionada.
 *
 * O texto vem de config/locales (conversations.activity.labels.added):
 * "%{user_name} adicionou %{labels}" em pt_BR e "... added ..." em en. As
 * etiquetas vem separadas por virgula. Comparar a etiqueta inteira importa:
 * `contrato_assinado` esta contido em `bpc_contrato_assinado`.
 */
export function addedLabels(content) {
  const m = /\s(?:adicionou|added)\s+(.+)$/.exec(String(content || ''));
  if (!m) return [];
  return m[1]
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);
}

class DashboardIaAPI extends ApiClient {
  constructor() {
    super('conversations', { accountScoped: true });
  }

  async page(inboxId, page) {
    const params = new URLSearchParams();
    params.set('status', 'all');
    params.set('page', String(page));
    params.set('inbox_id', String(inboxId));
    const res = await axios.get(`${this.url}?${params.toString()}`);
    const body = res.data || {};
    const data = body.data || body;
    return {
      payload: data.payload || [],
      allCount: (data.meta || {}).all_count ?? null,
    };
  }

  /**
   * Todas as conversas das caixas, ja como linhas.
   *
   * A pagina 1 de cada caixa diz o total e o tamanho da pagina
   * (CONVERSATION_RESULTS_PER_PAGE e variavel de ambiente, nao da para fixar
   * 25). As demais paginas saem em paralelo limitado: o Puma tem poucos
   * slots, compartilhados com o chat dos atendentes.
   *
   * Custo em 07/10/2026: 2.596 conversas em 3 caixas, ~105 requisicoes.
   */
  async scan({ inboxIds, onProgress = null }) {
    const rows = new Map();
    let fetched = 0;
    let total = 0;
    const add = payload => {
      payload.forEach(c => {
        const row = toRow(c);
        if (row) rows.set(row.id, row);
      });
      fetched += payload.length;
      if (onProgress) onProgress({ fetched, total });
    };

    const jobs = [];
    // eslint-disable-next-line no-restricted-syntax
    for (const inboxId of inboxIds) {
      // eslint-disable-next-line no-await-in-loop
      const first = await this.page(inboxId, 1);
      const size = first.payload.length;
      const all = first.allCount ?? size;
      total += all;
      add(first.payload);
      if (size > 0 && all > size) {
        const pages = Math.min(Math.ceil(all / size), MAX_PAGES_PER_INBOX);
        for (let p = 2; p <= pages; p += 1) jobs.push({ inboxId, page: p });
      }
    }

    await pool(jobs, SCAN_CONCURRENCY, async job => {
      const res = await this.page(job.inboxId, job.page);
      add(res.payload);
    });

    return [...rows.values()];
  }

  /**
   * Data (ms) em que a conversa recebeu uma das `labels`, ou null.
   *
   * A API devolve as 20 mensagens mais recentes; `before` volta no tempo. Para
   * na primeira ocorrencia de `stopLabel` (a propria etiqueta de contrato
   * assinado). Se o lead pulou direto para uma etapa posterior, vale a mais
   * antiga das etapas posteriores encontradas.
   */
  async signedDate(id, { labels, stopLabel }) {
    const wanted = new Set(labels);
    let before = null;
    let found = null;

    for (let i = 0; i < MAX_HISTORY_PAGES; i += 1) {
      const q = before ? `?before=${before}` : '';
      // eslint-disable-next-line no-await-in-loop
      const res = await axios.get(`${this.url}/${id}/messages${q}`);
      const body = res.data || {};
      const data = body.data || body;
      const msgs = data.payload || [];
      if (!msgs.length) break;

      let stop = false;
      msgs.forEach(m => {
        if (m.message_type !== 2 && m.message_type !== 'activity') return;
        const added = addedLabels(m.content);
        if (!added.some(l => wanted.has(l))) return;
        const at = m.created_at * 1000;
        if (found === null || at < found) found = at;
        if (added.includes(stopLabel)) stop = true;
      });
      if (stop || msgs.length < 20) break;
      before = Math.min(...msgs.map(m => m.id));
    }
    return found;
  }

  /**
   * Datas de assinatura de varias conversas. `targets` e
   * [{ id, labels, stopLabel }]. Falha numa conversa nao derruba as outras:
   * ela so fica sem data, e o painel mostra quantas ficaram.
   */
  async signedDates(targets, { onEach = null } = {}) {
    await pool(targets, 2, async t => {
      let at = null;
      try {
        at = await this.signedDate(t.id, t);
      } catch (e) {
        at = null;
      }
      if (onEach) onEach(t.id, at);
    });
  }
}

export default new DashboardIaAPI();
