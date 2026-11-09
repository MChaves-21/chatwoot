# Relatorio da Equipe (fork Goncalves & Silva).
#
# GET   /api/v1/accounts/:account_id/relatorio_equipe
#         ?since=AAAA-MM-DD&until=AAAA-MM-DD&inbox_ids[]=6&user_ids[]=3&labels[]=sdr
#       Agregados: mensagens por dia (cliente / equipe / IA / sem autor),
#       mensagens e conversas respondidas por usuario, totais.
#
# GET   /api/v1/accounts/:account_id/relatorio_equipe/mensagens  (mesmos filtros)
#       CSV com a lista das mensagens (ate 50 mil linhas; o cabecalho
#       X-Relatorio-Truncado diz se cortou). Sai em lotes, sem montar o arquivo
#       inteiro na memoria, e cada exportacao fica registrada no log (LGPD).
#
# PATCH /api/v1/accounts/:account_id/relatorio_equipe/ia_users  { user_ids: [..] }
#       Quais usuarios contam como IA (o n8n envia com o token de um usuario).
#       Fica em accounts.custom_attributes, igual as metas do Dashboard IA.
#
# So leitura de conversa e mensagem. Restrito a administrador: a lista tem
# o texto das mensagens dos clientes.
class Api::V1::Accounts::RelatorioEquipeController < Api::V1::Accounts::BaseController
  include ForkAdministratorOnly

  IA_USERS_KEY = 'relatorio_equipe_ia_users'.freeze

  def show
    render json: report.summary.merge(
      users: Current.account.users.order(:name).pluck(:id, :name).map { |id, name| { id: id, name: name } },
      ia_user_ids: stored_ia_user_ids,
      generated_at: Time.current.to_i
    )
  end

  # 09/11/2026: o CSV sai em lotes (Enumerator) em vez de uma String unica.
  # Last-Modified faz o Rack::ETag nao segurar o corpo para calcular o hash.
  def mensagens
    total = report.csv_count
    log_export(total)
    filename = "mensagens_#{report.since_date.iso8601}_#{report.until_date.iso8601}.csv"
    response.headers['X-Relatorio-Truncado'] = total > RelatorioEquipe::Report::CSV_LIMIT ? '1' : '0'
    response.headers['Content-Type'] = 'text/csv; charset=utf-8'
    response.headers['Content-Disposition'] = ActionDispatch::Http::ContentDisposition.format(disposition: 'attachment', filename: filename)
    response.headers['Cache-Control'] = 'no-store'
    response.headers['Last-Modified'] = Time.current.httpdate
    self.response_body = report.csv_enum
  end

  def ia_users
    asked = Array(params[:user_ids]).filter_map { |id| Integer(id, exception: false) }.uniq
    valid = Current.account.users.where(id: asked).pluck(:id)
    AccountSettingsStore.write(Current.account, IA_USERS_KEY) { valid }
    render json: { ia_user_ids: valid }
  end

  private

  def fork_screen_name
    'o Relatório da Equipe'
  end

  # LGPD (09/11/2026): o CSV tem telefone e texto das mensagens dos clientes.
  # Fica registrado quem exportou, quando, o periodo e os filtros — sem dado
  # pessoal no log.
  def log_export(total)
    Rails.logger.info(
      "[LGPD] relatorio_equipe.export account=#{Current.account.id} user=#{Current.user.id} " \
      "since=#{report.since_date.iso8601} until=#{report.until_date.iso8601} " \
      "inboxes=#{Array(params[:inbox_ids]).size} users=#{Array(params[:user_ids]).size} " \
      "labels=#{Array(params[:labels]).size} rows=#{[total, RelatorioEquipe::Report::CSV_LIMIT].min}"
    )
  end

  def report
    @report ||= RelatorioEquipe::Report.new(account: Current.account, params: params, ia_user_ids: stored_ia_user_ids)
  end

  def stored_ia_user_ids
    Array(AccountSettingsStore.read(Current.account, IA_USERS_KEY)).map(&:to_i)
  end
end
