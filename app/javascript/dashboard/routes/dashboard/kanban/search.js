/* global axios */
/**
 * Busca do Kanban — servidor, estado e cross-funil.
 *
 * Motivo de existir (17/08/2026)
 * ------------------------------
 * A busca antiga vivia dentro do FiltersModal e chamava passesFilter() sobre
 * `st.loaded`, ou seja, sobre os cards que a coluna ja tinha paginado. Quem
 * procurava um cliente que existe e ainda nao tinha sido carregado recebia
 * "nenhum resultado" — e o proprio modal avisava isso em letra miuda, pedindo
 * para clicar em "Ver mais" antes de filtrar. Este arquivo passa a busca para
 * o servidor.
 *
 * A armadilha do ?q= (nao remova este comentario)
 * -----------------------------------------------
 * O parametro `q` de GET /conversations NAO serve aqui. Ele busca no CONTEUDO
 * DAS MENSAGENS, nao no contato — app/finders/conversation_finder.rb:152 faz
 * `joins(:messages).where('messages.content ILIKE ...')`. Pior: a linha 82 do
 * mesmo arquivo e `filter_by_status unless params[:q]`, entao mandar `q` faz o
 * `status` ser silenciosamente ignorado. GET /conversations/search cai no mesmo
 * finder e tem o mesmo defeito.
 *
 * O caminho correto para nome/telefone e:
 *   1. GET /contacts/search?q=   (contacts_controller.rb:24 — ILIKE em name,
 *      email, phone_number e identifier)
 *   2. GET /contacts/:id/conversations
 *
 * O passo 2 devolve as conversas das DUAS caixas de uma vez, sem filtro de
 * inbox — o que aqui e uma vantagem: e exatamente a busca cross-funil.
 */

import ApiClient from '../../../api/ApiClient';
import { AUXILIO_COLUMNS, BPC_COLUMNS, FUNNELS } from './constants';
import {
  CLOSED_LABELS,
  STATE_COLUMNS,
  STATE_INBOX_IDS,
  INBOX_NAMES,
} from './stateConstants';

class KanbanSearchAPI extends ApiClient {
  constructor() {
    super('contacts', { accountScoped: true });
  }

  /** Contatos por nome, telefone, e-mail ou identificador. */
  async searchContacts(q, page = 1) {
    const params = new URLSearchParams();
    params.set('q', q);
    params.set('page', String(page));
    params.set('include_contacts', 'true');
    const res = await axios.get(`${this.url}/search?${params.toString()}`);
    const body = res.data || {};
    const data = body.data || body;
    return data.payload || data || [];
  }

  /**
   * Conversas de um contato. O controller ordena por last_activity_at e corta
   * em 20 (contacts/conversations_controller.rb) — sem paginacao. Para o uso
   * daqui isso basta: um lead comercial nao costuma ter mais que duas ou tres.
   */
  async contactConversations(contactId) {
    const res = await axios.get(`${this.url}/${contactId}/conversations`);
    const body = res.data || {};
    const data = body.data || body;
    return data.payload || data || [];
  }
}

const SearchAPI = new KanbanSearchAPI();

// --------------------------------------------------------------- normalizacao

/** minusculas, sem acento, sem pontuacao de telefone. */
export function normalize(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

/** So os digitos, para casar telefone digitado com ou sem mascara. */
export function onlyDigits(s) {
  return String(s || '').replace(/\D/g, '');
}

// ------------------------------------------------------------ termos de estado

/**
 * Sinonimos que o time digita para cada estado. Deliberadamente generosos:
 * quem procura "pendente" quer o mesmo que "aguardando".
 *
 * Decisao registrada — "fechado" x "desqualificado":
 * a coluna Fechado do quadro por estado e definida por CLOSED_LABELS, que JA
 * CONTEM 'desqualificado'. Se os dois termos apontassem para o mesmo conjunto,
 * digitar um ou outro daria quase a mesma lista e o filtro perderia utilidade.
 * Entao:
 *   - "desqualificado" casa SO com as duas etiquetas homonimas
 *     ('desqualificado' e 'bpc_desqualificado');
 *   - "fechado" casa com o grupo inteiro (inclui descarte_sdr, cancelado etc.).
 * Ou seja, desqualificado e um subconjunto proprio de fechado, e quem digita o
 * termo mais especifico recebe a lista mais especifica.
 */
export const DISQUALIFIED_ONLY = ['desqualificado', 'bpc_desqualificado'];

export const STATE_TERMS = [
  {
    key: 'aguardando',
    title: 'Aguardando',
    terms: ['aguardando', 'aguarda', 'pendente', 'pending', 'snoozed', 'adiado'],
    match: c => ['pending', 'snoozed'].includes(c.status),
  },
  {
    key: 'atendimento',
    title: 'Em atendimento',
    terms: ['atendimento', 'em atendimento', 'atendendo', 'respondido'],
    match: c => c.status === 'open' && Boolean(c.first_reply_created_at),
  },
  {
    key: 'aberto',
    title: 'Aberto',
    terms: ['aberto', 'abertos', 'open', 'sem resposta', 'nao respondido'],
    match: c => c.status === 'open' && !c.first_reply_created_at,
  },
  {
    key: 'resolvido',
    title: 'Resolvido',
    terms: ['resolvido', 'resolvida', 'resolved'],
    match: c =>
      c.status === 'resolved' &&
      !(c.labels || []).some(l => CLOSED_LABELS.includes(l)),
  },
  {
    key: 'fechado',
    title: 'Fechado',
    terms: ['fechado', 'fechada', 'fechados', 'descarte', 'descartado', 'perdido'],
    match: c => (c.labels || []).some(l => CLOSED_LABELS.includes(l)),
  },
  {
    key: 'desqualificado',
    title: 'Desqualificado',
    terms: ['desqualificado', 'desqualificada', 'desqualifica'],
    match: c => (c.labels || []).some(l => DISQUALIFIED_ONLY.includes(l)),
  },
];

/** Devolve a entrada de STATE_TERMS que o texto digitado representa, ou null. */
export function stateTermFor(q) {
  const n = normalize(q);
  if (n.length < 4) return null; // evita casar "ab" com "aberto"
  return (
    STATE_TERMS.find(t => t.terms.some(term => term === n)) ||
    STATE_TERMS.find(t => t.terms.some(term => term.startsWith(n))) ||
    null
  );
}

// ------------------------------------------------------------------ cross-funil

const STAGE_INDEX = (() => {
  const idx = {};
  AUXILIO_COLUMNS.forEach(c => {
    idx[c.label] = { funnel: 'Auxílio Acidente', stage: c.title };
  });
  BPC_COLUMNS.forEach(c => {
    idx[c.label] = { funnel: 'BPC', stage: c.title };
  });
  return idx;
})();

/** Em que funil e etapa a conversa esta, olhando as etiquetas dela. */
export function locate(conv) {
  const labels = Array.isArray(conv && conv.labels) ? conv.labels : [];
  for (const l of labels) {
    if (STAGE_INDEX[l]) return STAGE_INDEX[l];
  }
  const byInbox = INBOX_NAMES[conv && conv.inbox_id];
  return { funnel: byInbox || '—', stage: 'Sem etapa' };
}

/** Rotulo da coluna do quadro por estado, para exibir junto do resultado. */
export function stateTitle(conv) {
  const hit = STATE_TERMS.find(t => t.key !== 'desqualificado' && t.match(conv));
  return hit ? hit.title : '';
}

// ---------------------------------------------------------------------- busca

const isRelevantInbox = c => STATE_INBOX_IDS.includes(c && c.inbox_id);

/**
 * Busca principal. Duas estrategias, escolhidas pelo texto:
 *
 *   - termo de estado ("aguardando", "fechado"...) → nao ha o que perguntar ao
 *     servidor sobre contatos; devolve um marcador para a tela filtrar o que
 *     ja esta em memoria, que e o comportamento correto: estado e propriedade
 *     da conversa carregada, nao criterio de busca de contato.
 *   - qualquer outra coisa → contacts/search no servidor e, para cada contato,
 *     as conversas dele nas duas caixas.
 */
export async function searchEverywhere(rawQuery, { signal } = {}) {
  const q = String(rawQuery || '').trim();
  if (q.length < 3) return { kind: 'idle', results: [] };

  const term = stateTermFor(q);
  if (term) return { kind: 'state', term, results: [] };

  const digits = onlyDigits(q);
  const contacts = await SearchAPI.searchContacts(digits.length >= 4 ? digits : q);
  if (signal && signal.aborted) return { kind: 'aborted', results: [] };

  const results = [];
  const seen = new Set();

  for (const contact of contacts.slice(0, 12)) {
    let convs = [];
    try {
      convs = await SearchAPI.contactConversations(contact.id);
    } catch (e) {
      convs = [];
    }
    if (signal && signal.aborted) return { kind: 'aborted', results: [] };

    for (const conv of convs.filter(isRelevantInbox)) {
      if (seen.has(conv.id)) continue;
      seen.add(conv.id);
      const where = locate(conv);
      results.push({
        id: conv.id,
        name: contact.name || '(sem nome)',
        phone: contact.phone_number || '',
        inboxId: conv.inbox_id,
        funnel: where.funnel,
        stage: where.stage,
        state: stateTitle(conv),
        status: conv.status,
        conv,
      });
    }
  }

  results.sort((a, b) => a.funnel.localeCompare(b.funnel) || a.id - b.id);
  return { kind: 'contacts', results };
}

export { FUNNELS, STATE_COLUMNS };
