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
import { n8nTicket } from '../n8nTicket';
import { LAWCHAT_HISTORY_WEBHOOK_URL, SUMMARY_WEBHOOK_URL } from './constants';

class KanbanAPI extends ApiClient {
  constructor() {
    super('conversations', { accountScoped: true });
  }

  /** Prefixo da conta: /api/v1/accounts/:id */
  get base() {
    return this.url.replace(/\/conversations$/, '');
  }

  /**
   * 1a pagina de todas as colunas numa chamada so — 05/11/2026.
   *
   * Endpoint do fork (kanban_board_controller.rb). Devolve
   * { columns: { etiqueta: { total, payload } } } e, com `unstaged`, a coluna
   * "Sem etapa" na chave `unstaged_key`. Os cards vem enxutos: so os campos
   * que o quadro le.
   *
   * Lanca erro se o endpoint nao existir (imagem antiga) ou se a resposta vier
   * fora do formato; quem chama volta para uma requisicao por coluna.
   */
  async board({
    inboxId,
    labels,
    excludeLabels = [],
    status = 'all',
    unstaged,
  }) {
    const params = new URLSearchParams();
    params.set('inbox_id', String(inboxId));
    params.set('status', status || 'all');
    labels.forEach(l => params.append('labels[]', l));
    excludeLabels.forEach(l => params.append('exclude_labels[]', l));
    if (unstaged) params.set('unstaged', '1');
    const res = await axios.get(
      `${this.base}/kanban_board?${params.toString()}`
    );
    const data = res.data || {};
    if (!data.columns || typeof data.columns !== 'object') {
      throw new Error('Resposta inesperada do endpoint do Kanban.');
    }
    return data;
  }

  /**
   * Todos os cards do quadro numa chamada, para o Excel — 09/11/2026
   * (kanban_board_controller.rb#cards). Devolve { payload, total, truncated }.
   * Lanca erro se o endpoint nao existir; quem chama volta para o
   * loadEverything (que corta em MAX_PAGES_PER_COLUMN paginas por coluna).
   */
  async cards({ inboxId, labels, excludeLabels = [], status = 'all', unstaged }) {
    const params = new URLSearchParams();
    params.set('inbox_id', String(inboxId));
    params.set('status', status || 'all');
    labels.forEach(l => params.append('labels[]', l));
    excludeLabels.forEach(l => params.append('exclude_labels[]', l));
    if (unstaged) params.set('unstaged', '1');
    const res = await axios.get(
      `${this.base}/kanban_board/cards?${params.toString()}`
    );
    const data = res.data || {};
    if (!Array.isArray(data.payload)) {
      throw new Error('Resposta inesperada do endpoint do Kanban.');
    }
    return data;
  }

  /**
   * Texto das conversas para o Excel "Conversas" — 11/11/2026
   * (kanban_board_controller.rb#transcripts). Vai de 500 em 500 ids, um lote
   * por vez (o servidor tem 2 vCPU). Devolve { display_id: texto }.
   */
  async transcripts({ inboxId, ids }) {
    const out = {};
    for (let i = 0; i < ids.length; i += 500) {
      // eslint-disable-next-line no-await-in-loop
      const res = await axios.post(`${this.base}/kanban_board/transcripts`, {
        inbox_id: inboxId,
        ids: ids.slice(i, i + 500),
      });
      Object.assign(out, (res.data || {}).payload || {});
    }
    return out;
  }

  /**
   * Conversas do quadro criadas (mode=created) ou atualizadas (mode=updated)
   * num dia, numa chamada so — 09/11/2026 (kanban_board_controller.rb#day).
   * Devolve { payload, total, truncated }. Lanca erro se o endpoint nao
   * existir (imagem antiga); quem chama volta para o loadEverything.
   */
  async day({
    inboxId,
    labels,
    excludeLabels = [],
    status = 'all',
    unstaged,
    mode,
    date,
  }) {
    const params = new URLSearchParams();
    params.set('inbox_id', String(inboxId));
    params.set('status', status || 'all');
    params.set('mode', mode === 'updated' ? 'updated' : 'created');
    params.set('date', date);
    labels.forEach(l => params.append('labels[]', l));
    excludeLabels.forEach(l => params.append('exclude_labels[]', l));
    if (unstaged) params.set('unstaged', '1');
    const res = await axios.get(
      `${this.base}/kanban_board/day?${params.toString()}`
    );
    const data = res.data || {};
    if (!Array.isArray(data.payload)) {
      throw new Error('Resposta inesperada do endpoint do Kanban.');
    }
    return data;
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
  async listByLabel({
    label,
    page = 1,
    status = 'all',
    inboxId = null,
    excludeLabels = [],
  }) {
    // Com etiquetas a esconder (ex.: importados do LawChat), a listagem simples
    // nao serve: ela so sabe incluir etiquetas. O filtro do Chatwoot faz o
    // EXISTS da etapa e o NOT EXISTS das excluidas, e o all_count ja vem certo.
    if (excludeLabels.length) {
      const payload = [
        {
          attribute_key: 'labels',
          filter_operator: 'equal_to',
          values: [label],
          query_operator: 'and',
        },
        {
          attribute_key: 'labels',
          filter_operator: 'not_equal_to',
          values: excludeLabels,
          query_operator:
            inboxId || (status && status !== 'all') ? 'and' : null,
        },
      ];
      if (inboxId) {
        payload.push({
          attribute_key: 'inbox_id',
          filter_operator: 'equal_to',
          values: [inboxId],
          query_operator: status && status !== 'all' ? 'and' : null,
        });
      }
      if (status && status !== 'all') {
        payload.push({
          attribute_key: 'status',
          filter_operator: 'equal_to',
          values: [status],
          query_operator: null,
        });
      }
      const res = await axios.post(`${this.url}/filter?page=${page}`, {
        payload,
      });
      const body = res.data || {};
      const data = body.data || body;
      return {
        payload: data.payload || [],
        total: (data.meta || {}).all_count,
      };
    }

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
   * Uma pagina das conversas da caixa que NAO tem nenhuma etiqueta de etapa
   * do funil — a coluna "Sem etapa".
   *
   * 26/10/2026: passou a usar o filtro do proprio Chatwoot
   * (POST /conversations/filter, `labels` com `not_equal_to`, que vira NOT
   * EXISTS na tabela de etiquetas). Antes lia a caixa inteira e filtrava aqui,
   * com teto de 40 paginas: a caixa 15 (BPC, 1.174 conversas) ja passava do
   * teto e a coluna truncava calada, e a caixa 6 nem tinha a coluna. Agora
   * pagina como as outras colunas e o all_count ja vem filtrado.
   */
  async listWithoutStage({ inboxId, page = 1, status = 'all', stageLabels }) {
    const payload = [
      {
        attribute_key: 'inbox_id',
        filter_operator: 'equal_to',
        values: [inboxId],
        query_operator: 'and',
      },
      {
        attribute_key: 'labels',
        filter_operator: 'not_equal_to',
        values: stageLabels,
        query_operator: status && status !== 'all' ? 'and' : null,
      },
    ];
    if (status && status !== 'all') {
      payload.push({
        attribute_key: 'status',
        filter_operator: 'equal_to',
        values: [status],
        query_operator: null,
      });
    }
    const res = await axios.post(`${this.url}/filter?page=${page}`, {
      payload,
    });
    const body = res.data || {};
    const data = body.data || body;
    return {
      payload: data.payload || [],
      total: (data.meta || {}).all_count,
    };
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
/**
 * 05/11/2026: o kanban-lead autentica pelo ticket assinado (n8nTicket.js) e so
 * responde a quem pertence a conta 1. O login da sessao nao vai mais ao n8n.
 * (Antes, 22/10/2026: autenticava pela sessao do Chatwoot.) O `secret` antigo vai junto apenas
 * enquanto existir no localStorage, para a transicao; depois do deploy o n8n
 * deixa de aceita-lo.
 */
export async function fetchLead({ url, secret, phone }) {
  if (!phone || !url) return null;
  try {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        phone,
        ticket: await n8nTicket('kanban_lead'),
        secret: secret || undefined,
      }),
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

/**
 * Resumo do card por IA — 06/11/2026.
 *
 * Quem le a conversa e o n8n (todas as paginas + transcricao dos audios na
 * memoria da IA comercial); aqui so vai o ticket e o id. Sem `secret` e sem
 * `messages`. `force` pula o cache guardado na conversa (botao de refazer).
 *
 * Devolve o texto ou null. null = o popup cai na ficha local, como antes.
 */
export async function fetchSummary({ conversationId, force = false }) {
  if (!conversationId) return null;
  const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = ctrl ? setTimeout(() => ctrl.abort(), 30000) : null;
  try {
    const r = await fetch(SUMMARY_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ticket: await n8nTicket('kanban_resumo'),
        conversation_id: conversationId,
        force: force || undefined,
      }),
      signal: ctrl ? ctrl.signal : undefined,
    });
    if (!r.ok) return null;
    let d = await r.json();
    if (Array.isArray(d)) d = d[0] || {};
    return (
      d.summary || d.resumo || d.text || (d.json && (d.json.summary || d.json.resumo)) || null
    );
  } catch (e) {
    return null;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * Historico do LawChat do contato do card — 11/11/2026.
 *
 * Devolve { atendimentos: [{ id, etapa, atendente, criado_em, encerrado_em,
 * mensagens: [{ em, quem, autor, texto, anexo }] }] } ou lanca erro (a aba
 * mostra o erro; nao ha plano B local, o historico so existe no banco).
 */
export async function fetchLawchatHistory({ conversationId }) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 30000);
  try {
    const r = await fetch(LAWCHAT_HISTORY_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ticket: await n8nTicket('kanban_lawchat'),
        conversation_id: conversationId,
      }),
      signal: ctrl.signal,
    });
    if (!r.ok) throw new Error(`n8n respondeu ${r.status}`);
    const d = await r.json();
    return Array.isArray(d.atendimentos) ? d.atendimentos : [];
  } finally {
    clearTimeout(timer);
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
  // 05/11/2026: o n8n autentica pelo ticket assinado (n8nTicket.js). O `secret`
  // antigo so vai junto se ainda estiver nas Configuracoes deste navegador.
  if (!url) return { ok: false, error: 'Webhook de agendamento não configurado.' };
  try {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        secret: secret || undefined,
        ticket: await n8nTicket('kanban_agendar'),
        conversation_id: conversationId,
        inbox_id: inboxId,
        phone,
        contact_name: contactName,
        scheduled_at: scheduledAt,
        content,
      }),
    });
    if (!r.ok) {
      // A recusa do n8n traz o motivo em `error` (login, data, mensagem vazia).
      let motivo = '';
      try {
        motivo = (JSON.parse(await r.text()) || {}).error || '';
      } catch (e) {
        motivo = '';
      }
      return { ok: false, error: motivo || `O n8n respondeu ${r.status}.` };
    }
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
