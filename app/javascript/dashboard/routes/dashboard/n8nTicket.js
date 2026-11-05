/**
 * Passe assinado para os webhooks do n8n (fork Goncalves & Silva) — 05/11/2026.
 *
 * Vem do endpoint do fork (n8n_tickets_controller.rb) e vale 5 minutos. Vai
 * no corpo das chamadas ao n8n como `ticket`. Substituiu o login da sessao
 * (`auth`), que o n8n guardava nas execucoes: desde 05/11/2026 o `auth` nao
 * vai mais. Os 4 fluxos (kanban-lead, kanban-agendar, disparador-api,
 * dashboard-ia-motivos) conferem o ticket com a mesma N8N_TICKET_SECRET.
 *
 * Devolve '' se o servidor nao tiver N8N_TICKET_SECRET ou a chamada falhar.
 */
import ApiClient from '../../api/ApiClient';

class N8nTicketAPI extends ApiClient {
  constructor() {
    super('n8n_ticket', { accountScoped: true });
  }
}

const api = new N8nTicketAPI();
// Margem para o ticket nao vencer no caminho ate o n8n.
const MARGIN_SECONDS = 30;
let cached = null;

export async function n8nTicket() {
  const now = Math.floor(Date.now() / 1000);
  // Chave pela URL: trocar de conta no painel nao reaproveita o ticket da outra.
  if (
    cached &&
    cached.url === api.url &&
    cached.expiresAt - MARGIN_SECONDS > now
  )
    return cached.ticket;
  try {
    const { data } = await api.get();
    cached = { url: api.url, ticket: data.ticket, expiresAt: data.expires_at };
    return cached.ticket;
  } catch (e) {
    cached = null;
    return '';
  }
}
