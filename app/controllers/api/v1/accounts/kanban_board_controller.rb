# Kanban (fork Goncalves & Silva) — 05/11/2026.
#
# GET /api/v1/accounts/:account_id/kanban_board
#     ?inbox_id=11&labels[]=sdr&labels[]=comercial&exclude_labels[]=importado&unstaged=1&status=all
#
#   A 1a pagina de TODAS as colunas do quadro numa chamada so, com o total de
#   cada coluna. Antes o quadro fazia um GET /conversations por coluna, 3 por
#   vez, e cada um serializava 25 conversas com a ultima mensagem, a ultima
#   mensagem nao-atividade e as nao lidas (3 a 4 consultas por card). Medido em
#   05/11/2026 na caixa 11: 1,2 a 1,9 s por coluna e 8 a 10 s para abrir.
#
#   Aqui o card vem enxuto, so com o que o Kanban le (ver helpers.js e
#   KanbanCard.vue), e as nao lidas de todos os cards saem numa consulta so.
#
#   Mesma ordem (last_activity_at desc) e mesmo tamanho de pagina
#   (CONVERSATION_RESULTS_PER_PAGE) da lista de conversas: a pagina 2 em diante
#   continua vindo da API normal sem pular nem repetir card.
#
# So leitura. Mesmo filtro de permissao da lista de conversas
# (Conversations::PermissionFilterService) e so caixas do usuario.
class Api::V1::Accounts::KanbanBoardController < Api::V1::Accounts::BaseController
  MAX_COLUMNS = 40
  UNSTAGED_KEY = '__sem_etapa__'.freeze
  # Igual a Conversation#unread_incoming_messages, que corta em 10.
  MAX_UNREAD = 10

  def show
    inbox = Current.user.assigned_inboxes.find_by(id: params[:inbox_id])
    return render json: { error: 'Caixa não encontrada' }, status: :not_found if inbox.nil?

    base = filtered_by_status(accessible_conversations(inbox))
    pages = stage_labels.index_with { |label| page_of(with_label(base, label)) }
    pages[UNSTAGED_KEY] = page_of(base.tagged_with(stage_labels + exclude_labels, exclude: true)) if unstaged?

    unread = unread_counts(pages.values.flat_map { |page| page[:rows] })
    render json: {
      per_page: per_page,
      unstaged_key: UNSTAGED_KEY,
      columns: pages.transform_values { |page| { total: page[:total], payload: page[:rows].map { |c| card(c, unread[c.id]) } } }
    }
  end

  private

  def accessible_conversations(inbox)
    Conversations::PermissionFilterService.new(Current.account.conversations.where(inbox_id: inbox.id), Current.user, Current.account).perform
  end

  # Mesma regra do ConversationFinder: "all" nao filtra, sem status vale "open".
  def filtered_by_status(scope)
    return scope if params[:status] == 'all'

    scope.where(status: params[:status] || 'open')
  end

  def with_label(scope, label)
    scope = scope.tagged_with([label], any: true)
    exclude_labels.any? ? scope.tagged_with(exclude_labels, exclude: true) : scope
  end

  def page_of(scope)
    {
      total: scope.count,
      rows: scope.sort_on_last_activity_at(:desc).limit(per_page).includes(:contact, :assignee, :assignee_agent_bot).to_a
    }
  end

  def card(conversation, unread)
    {
      id: conversation.display_id,
      inbox_id: conversation.inbox_id,
      status: conversation.status,
      labels: conversation.cached_label_list_array,
      created_at: conversation.created_at.to_i,
      timestamp: conversation.last_activity_at.to_i,
      last_activity_at: conversation.last_activity_at.to_i,
      first_reply_created_at: conversation.first_reply_created_at.to_i,
      unread_count: [unread.to_i, MAX_UNREAD].min,
      custom_attributes: conversation.custom_attributes,
      additional_attributes: conversation.additional_attributes,
      meta: { sender: sender(conversation.contact), assignee: assignee(conversation) }
    }
  end

  def sender(contact)
    return {} if contact.nil?

    { id: contact.id, name: contact.name, phone_number: contact.phone_number }
  end

  def assignee(conversation)
    entity = conversation.assignee || conversation.assignee_agent_bot
    entity && { id: entity.id, name: entity.name }
  end

  # Mensagens recebidas depois que um agente viu a conversa pela ultima vez —
  # a mesma conta de Conversation#unread_messages, para todos os cards juntos.
  def unread_counts(conversations)
    return {} if conversations.empty?

    Message.unscoped
           .joins(:conversation)
           .where(account_id: Current.account.id, conversation_id: conversations.map(&:id), message_type: :incoming)
           .where('conversations.agent_last_seen_at IS NULL OR messages.created_at > conversations.agent_last_seen_at')
           .group(:conversation_id)
           .count
  end

  def stage_labels
    @stage_labels ||= label_param(:labels).first(MAX_COLUMNS)
  end

  def exclude_labels
    @exclude_labels ||= label_param(:exclude_labels)
  end

  def label_param(key)
    Array(params[key]).map { |label| label.to_s.strip }.reject(&:empty?).uniq
  end

  def unstaged?
    ActiveModel::Type::Boolean.new.cast(params[:unstaged])
  end

  def per_page
    ENV.fetch('CONVERSATION_RESULTS_PER_PAGE', '25').to_i
  end
end
