/* global axios */
/**
 * Kanban Comercial — acesso a API.
 *
 * Substitui a funcao cwRequest() do arquivo original, que empacotava
 * {method, path, body, secret} e mandava para o webhook kanban-proxy do n8n.
 *
 * Aqui as chamadas vao direto para a API do Chatwoot pelo cliente axios do
 * dashboard, que ja carrega a autenticacao do agente logado. Consequencias:
 *
 *   - o segredo compartilhado do proxy deixa de existir no navegador;
 *   - cada agente enxerga apenas o que tem permissao de enxergar;
 *   - o account id sai da URL da rota (ApiClient.accountIdFromRoute), entao
 *     nao ha mais campo "Account ID" para alguem preencher errado.
 */

import ApiClient from '../../../api/ApiClient';

class KanbanAPI extends ApiClient {
  constructor() {
    super('conversations', { accountScoped: true });
  }

  /**
   * Uma pagina de conversas de uma etiqueta. O tamanho da pagina vem de
   * CONVERSATION_RESULTS_PER_PAGE no servidor (25 por padrao), entao nao ha
   * constante equivalente aqui; o total confiavel e o meta.all_count.
   */
  async listByLabel({ label, page = 1, status = 'all' }) {
    const params = new URLSearchParams();
    params.set('status', status || 'all');
    params.set('page', String(page));
    params.append('labels[]', label);

    const res = await axios.get(`${this.url}?${params.toString()}`);
    const body = res.data || {};
    const data = body.data || body;
    const payload = data.payload || [];
    const meta = data.meta || {};
    const total =
      meta.all_count !== undefined && meta.all_count !== null
        ? meta.all_count
        : meta.count !== undefined && meta.count !== null
          ? meta.count
          : payload.length;

    return { payload, total };
  }

  /** Conversa completa, com labels e assignee atualizados. */
  async getConversation(id) {
    const res = await axios.get(`${this.url}/${id}`);
    const body = res.data || {};
    return body.data || body;
  }

  /** Mensagens da conversa, ja desembrulhadas em array. */
  async getMessages(id) {
    const res = await axios.get(`${this.url}/${id}/messages`);
    const body = res.data || {};
    const data = body.data || body;
    return data.payload || data || [];
  }

  /**
   * ATENCAO: a API do Chatwoot SUBSTITUI o conjunto de etiquetas, nao
   * acrescenta. Quem chama precisa montar a lista final completa.
   */
  updateLabels(id, labels) {
    return axios.post(`${this.url}/${id}/labels`, { labels });
  }
}

export default new KanbanAPI();

/**
 * Webhooks do n8n que NAO passam pela API do Chatwoot e por isso continuam
 * sendo chamados direto: consulta de lead no Supabase e resumo por IA.
 *
 * O segredo destes dois fica no localStorage. Isso e bem menos grave que o
 * arranjo anterior — antes o mesmo segredo abria um encaminhador generico
 * para toda a API do Chatwoot; agora alcanca apenas estes dois endpoints.
 * Ainda assim: use um segredo diferente do antigo e limite os workflows.
 */
export async function fetchLead({ url, secret, phone }) {
  if (!phone || !url || !secret) return null;
  try {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone, secret }),
    });
    if (!r.ok) return null;
    let d = await r.json();
    if (Array.isArray(d)) d = d[0] || null;
    if (d && (d.id !== undefined || d.Telefone !== undefined)) return d;
    return null;
  } catch (e) {
    return null;
  }
}

export async function fetchSummary({ url, secret, conversationId, phone, messages }) {
  if (!url || !secret) return null;
  try {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        conversation_id: conversationId,
        phone,
        secret,
        messages,
      }),
    });
    if (!r.ok) return null;
    let d = await r.json();
    if (Array.isArray(d)) d = d[0] || {};
    return (
      d.summary || d.resumo || d.text || (d.json && (d.json.summary || d.json.resumo)) || null
    );
  } catch (e) {
    return null;
  }
}
