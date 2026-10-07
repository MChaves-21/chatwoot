# Dashboard IA (fork Goncalves & Silva).
#
# GET  /api/v1/accounts/:account_id/dashboard_ia?inbox_ids[]=6&inbox_ids[]=9
#   Devolve, numa chamada so, o que a tela do painel precisava de ~105
#   requisicoes para montar: uma linha enxuta por conversa, a data em que cada
#   etiqueta foi aplicada pela primeira vez (lida das mensagens de atividade) e
#   as metas mensais.
#
# PATCH /api/v1/accounts/:account_id/dashboard_ia/goals   { goals: { funil: n } }
#   Guarda as metas em accounts.custom_attributes, para todos verem a mesma.
#
# So leitura de conversa; nao cria nem altera conversa, mensagem ou etiqueta.
# Restrito a administrador: sao numeros comerciais do escritorio inteiro.
# A tela tem plano B (le pela API de conversas) se este endpoint falhar.
class Api::V1::Accounts::DashboardIaController < Api::V1::Accounts::BaseController
  GOALS_KEY = 'dashboard_ia_goals'.freeze
  MAX_INBOXES = 20

  before_action :ensure_administrator

  def show
    ids = inbox_ids
    conversations = conversation_rows(ids)
    render json: {
      rows: conversations,
      agents: agent_names(conversations),
      stages: stage_history(ids),
      goals: stored_goals,
      generated_at: Time.current.to_i
    }
  end

  def goals
    cleaned = DashboardIa::HistoryParser.clean_goals(params[:goals].respond_to?(:to_unsafe_h) ? params[:goals].to_unsafe_h : {})
    merged = stored_goals.merge(cleaned)
    account = Current.account
    account.update!(custom_attributes: (account.custom_attributes || {}).merge(GOALS_KEY => merged))
    render json: { goals: merged }
  end

  private

  def ensure_administrator
    return if Current.account_user&.administrator?

    render json: { error: 'Apenas administradores acessam o Dashboard IA' }, status: :forbidden
  end

  # So caixas desta conta; id de outra conta e descartado em silencio.
  def inbox_ids
    asked = Array(params[:inbox_ids]).filter_map { |id| Integer(id, exception: false) }.uniq.first(MAX_INBOXES)
    Current.account.inboxes.where(id: asked).pluck(:id)
  end

  # [id, inbox_id, etiquetas, criada, ultima atividade, responsavel, ddd]
  def conversation_rows(ids)
    Current.account.conversations
           .where(inbox_id: ids)
           .left_joins(:contact)
           .pluck(:id, :inbox_id, :cached_label_list, :created_at, :last_activity_at, :assignee_id, 'contacts.phone_number')
           .map do |id, inbox_id, labels, created_at, last_activity_at, assignee_id, phone|
      [
        id,
        inbox_id,
        labels.to_s.split(',').map(&:strip).reject(&:empty?),
        created_at&.to_i,
        last_activity_at&.to_i,
        assignee_id,
        DashboardIa::HistoryParser.ddd(phone)
      ]
    end
  end

  def agent_names(conversations)
    ids = conversations.filter_map { |row| row[5] }.uniq
    User.where(id: ids).pluck(:id, :name).to_h
  end

  # { id da conversa => { etiqueta => epoch da primeira vez } }
  def stage_history(ids)
    events = Message.unscoped.where(account_id: Current.account.id, inbox_id: ids, message_type: :activity)
                    .where('content ~* ?', '\\s(adicionou|added)\\s')
                    .pluck(:conversation_id, :content, :created_at)
                    .map { |conversation_id, content, created_at| [conversation_id, content, created_at.to_i] }
    DashboardIa::HistoryParser.first_seen(events)
  end

  def stored_goals
    DashboardIa::HistoryParser.clean_goals((Current.account.custom_attributes || {})[GOALS_KEY])
  end
end
