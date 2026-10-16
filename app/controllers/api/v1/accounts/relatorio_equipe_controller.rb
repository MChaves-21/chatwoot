# Relatorio da Equipe (fork Goncalves & Silva).
#
# GET   /api/v1/accounts/:account_id/relatorio_equipe
#         ?since=AAAA-MM-DD&until=AAAA-MM-DD&inbox_ids[]=6&user_ids[]=3&labels[]=sdr
#       Agregados: mensagens por dia (cliente / equipe / IA / sem autor),
#       mensagens e conversas respondidas por usuario, totais.
#
# GET   /api/v1/accounts/:account_id/relatorio_equipe/mensagens  (mesmos filtros)
#       CSV com a lista das mensagens (ate 50 mil linhas; o cabecalho
#       X-Relatorio-Truncado diz se cortou).
#
# PATCH /api/v1/accounts/:account_id/relatorio_equipe/ia_users  { user_ids: [..] }
#       Quais usuarios contam como IA (o n8n envia com o token de um usuario).
#       Fica em accounts.custom_attributes, igual as metas do Dashboard IA.
#
# So leitura de conversa e mensagem. Restrito a administrador: a lista tem
# o texto das mensagens dos clientes.
class Api::V1::Accounts::RelatorioEquipeController < Api::V1::Accounts::BaseController
  IA_USERS_KEY = 'relatorio_equipe_ia_users'.freeze

  before_action :ensure_administrator

  def show
    render json: report.summary.merge(
      users: Current.account.users.order(:name).pluck(:id, :name).map { |id, name| { id: id, name: name } },
      ia_user_ids: stored_ia_user_ids,
      generated_at: Time.current.to_i
    )
  end

  def mensagens
    csv, truncated = report.to_csv
    response.headers['X-Relatorio-Truncado'] = truncated ? '1' : '0'
    send_data csv,
              filename: "mensagens_#{report.since_date.iso8601}_#{report.until_date.iso8601}.csv",
              type: 'text/csv; charset=utf-8',
              disposition: 'attachment'
  end

  def ia_users
    asked = Array(params[:user_ids]).filter_map { |id| Integer(id, exception: false) }.uniq
    valid = Current.account.users.where(id: asked).pluck(:id)
    account = Current.account
    account.update!(custom_attributes: (account.custom_attributes || {}).merge(IA_USERS_KEY => valid))
    render json: { ia_user_ids: valid }
  end

  private

  def ensure_administrator
    return if Current.account_user&.administrator?

    render json: { error: 'Apenas administradores acessam o Relatório da Equipe' }, status: :forbidden
  end

  def report
    @report ||= RelatorioEquipe::Report.new(account: Current.account, params: params, ia_user_ids: stored_ia_user_ids)
  end

  def stored_ia_user_ids
    Array((Current.account.custom_attributes || {})[IA_USERS_KEY]).map(&:to_i)
  end
end
