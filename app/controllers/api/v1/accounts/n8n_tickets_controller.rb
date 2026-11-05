# Passe assinado para os webhooks do n8n (fork Goncalves & Silva) — 05/11/2026.
#
# GET /api/v1/accounts/:account_id/n8n_ticket
#   Devolve { ticket, expires_at }. O ticket e "<payload>.<assinatura>":
#     payload    = Base64 url-safe (sem "=") do JSON
#                  { u: user_id, a: account_id, r: "administrator"|"agent", e: expira_em_epoch }
#     assinatura = HMAC-SHA256 hexadecimal do payload (o texto Base64), com N8N_TICKET_SECRET
#
# Por que existe: o Kanban, o Agendar, o Disparador e o Dashboard IA mandavam ao
# n8n o login da sessao (access-token, client, uid) para o n8n perguntar ao
# Chatwoot quem estava logado. O n8n guarda o corpo das execucoes, entao o
# login de quem usava a tela ficava salvo la. O ticket diz quem e a pessoa, vale
# poucos minutos e nao abre o Chatwoot.
#
# O n8n confere: assinatura igual (comparacao em tempo constante), `e` no
# futuro e `a`/`r` permitidos. O segredo fica so na variavel de ambiente do
# Chatwoot e numa credencial do n8n.
#
# Sem N8N_TICKET_SECRET configurado devolve 503 e as telas seguem com o login
# antigo — da para publicar o fork antes de configurar o n8n.
class Api::V1::Accounts::N8nTicketsController < Api::V1::Accounts::BaseController
  TTL = 5.minutes

  def show
    secret = ENV.fetch('N8N_TICKET_SECRET', '')
    return render json: { error: 'N8N_TICKET_SECRET não configurado' }, status: :service_unavailable if secret.blank?

    expires_at = TTL.from_now.to_i
    payload = Base64.urlsafe_encode64(
      { u: Current.user.id, a: Current.account.id, r: Current.account_user.role, e: expires_at }.to_json,
      padding: false
    )
    render json: { ticket: "#{payload}.#{OpenSSL::HMAC.hexdigest('SHA256', secret, payload)}", expires_at: expires_at }
  end
end
