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
import { MAX_PAGES_UNSTAGED } from './constants';

class KanbanAPI extends ApiClient {
  constructor() {
    super('conversations', { accountScoped: true });
  }

  /**
   * Uma pagina de conversas de uma etiqueta. O tamanho da pagina vem de
   * CONVERSATION_RESULTS_PER_PAGE no servidor (25 por padrao), entao nao ha
   * constante equivalente aqui; o total confiavel e o meta.all_count.
   *
   * inboxId nao e opcional na pratica: sem ele o Chatwoot devolve as conversas
   * de TODAS as caixas, que era o defeito corrigido em 07/08/2026 — o quadro de
   * Auxilio Acidente mostrava conversas do BPC misturadas. O ConversationFinder
   * ja aceita inbox_id (set_inboxes) e aplica o filtro antes de contar, entao o
   * meta.all_count continua confiavel.
   */
  async listByLabel({ label, page = 1, status = 'all', inboxId = null }) {
    const params = new URLSearchParams();
    params.set('status', status || 'all');
    params.set('page', String(page));
    params.append('labels[]', label);
    if (inboxId) params.set('inbox_id', String(inboxId));

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

  /**
   * Conversas da caixa que NAO tem nenhuma das etiquetas de etapa do funil.
   *
   * A API do Chatwoot nao sabe filtrar por ausencia de etiqueta, entao aqui se
   * le a caixa inteira e filtra no cliente. Consequencias que quem mexer nisso
   * precisa saber:
   *
   *   - o custo e proporcional ao tamanho da caixa, nao ao da coluna;
   *   - por isso a coluna carrega de uma vez so (done = true no fim) em vez de
   *     paginar com "Ver mais": paginar aqui daria contagem errada, ja que o
   *     meta.all_count conta a caixa toda e nao o que sobrou do filtro.
   *
   * Se a caixa passar de alguns milhares de conversas, isto precisa virar um
   * endpoint no servidor. MAX_PAGES_UNSTAGED e o freio ate la.
   */
  async listWithoutStage({ inboxId, status = 'all', stageLabels = [] }) {
    const stage = new Set(stageLabels);
    const out = [];
    let fetched = 0;

    for (let page = 1; page <= MAX_PAGES_UNSTAGED; page += 1) {
      const params = new URLSearchParams();
      params.set('status', status || 'all');
      params.set('page', String(page));
      if (inboxId) params.set('inbox_id', String(inboxId));

      // eslint-disable-next-line no-await-in-loop
      const res = await axios.get(`${this.url}?${params.toString()}`);
      const body = res.data || {};
      const data = body.data || body;
      const payload = data.payload || [];
      if (!payload.length) break;

      payload.forEach(c => {
        const labels = c.labels || (c.meta && c.meta.labels) || [];
        if (!labels.some(l => stage.has(l))) out.push(c);
      });

      // Contar o acumulado, e nao page * tamanho da pagina: a ultima pagina vem
      // curta e a multiplicacao pararia cedo, escondendo conversas.
      fetched += payload.length;
      const meta = data.meta || {};
      const all = meta.all_count;
      if (all !== undefined && all !== null && fetched >= all) break;
    }

    return { payload: out, total: out.length };
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

  /**
   * Muda o status da conversa (open / pending / resolved / snoozed).
   *
   * Usado desde 12/08/2026 para resolver a conversa ao descartar o lead (ver
   * moveToStage). E o mesmo endpoint que o botao Resolver da tela de conversa
   * chama; nao ha como mudar status pela chamada de etiquetas.
   */
  toggleStatus(id, status) {
    return axios.post(`${this.url}/${id}/toggle_status`, { status });
  }

  /**
   * Nota interna na conversa (nao vai para o cliente pelo Chatwoot).
   *
   * ATENCAO antes de usar: `private: true` NAO impede o despacho para o
   * webhook da caixa. `webhook_sendable?` (message_filter_helpers.rb) e
   * `incoming? || outgoing? || template?` e nao testa `private?`, ao contrario
   * da `notifiable?` logo abaixo. O payload leva `private: true`, entao quem
   * decide se aquilo vira mensagem no WhatsApp e a uazapi, nao o Chatwoot.
   * Ver ScheduleMessageButton.vue.
   */
  createPrivateNote(id, content) {
    return axios.post(`${this.url}/${id}/messages`, {
      content,
      private: true,
      message_type: 'outgoing',
    });
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

/**
 * Grava um agendamento de mensagem — 14/08/2026.
 *
 * Ao contrario de fetchLead e fetchSummary, esta funcao ESCREVE, e por isso
 * devolve {ok, error} em vez de null: quem chama precisa poder dizer ao
 * atendente que NAO agendou. Um null silencioso aqui viraria um botao que
 * parece funcionar — o pior desfecho possivel para um agendador.
 *
 * `scheduledAt` chega em ISO UTC (o componente converte). Nao mande horario
 * local sem fuso: o cron compararia 15:00 de Fortaleza com 15:00 UTC e
 * dispararia tres horas cedo.
 */
export async function scheduleMessage({
  url,
  secret,
  conversationId,
  inboxId,
  phone,
  contactName,
  scheduledAt,
  content,
}) {
  if (!url || !secret) return { ok: false, error: 'Webhook de agendamento não configurado.' };
  try {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        secret,
        conversation_id: conversationId,
        inbox_id: inboxId,
        phone,
        contact_name: contactName,
        scheduled_at: scheduledAt,
        content,
      }),
    });
    if (!r.ok) return { ok: false, error: `O n8n respondeu ${r.status}.` };
    // Resposta vazia conta como sucesso: um webhook do n8n com "Respond
    // Immediately" devolve 200 sem corpo, e exigir JSON aqui reprovaria um
    // agendamento que de fato gravou.
    const txt = await r.text();
    if (!txt) return { ok: true };
    try {
      const d = JSON.parse(txt);
      const item = Array.isArray(d) ? d[0] || {} : d;
      if (item.ok === false || item.error) {
        return { ok: false, error: item.error || 'O n8n recusou o agendamento.' };
      }
    } catch (e) {
      // corpo que nao e JSON, mas o status foi 2xx
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message || 'Falha de rede ao agendar.' };
  }
}
