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
  # Teto da tela do dia. Num dia normal sao dezenas; o teto so pesa em dia de
  # importacao em massa (28-30/10/2026: milhares de conversas criadas).
  MAX_DAY_ROWS = 3000
  DAY_ZONE = 'America/Sao_Paulo'.freeze
  # Teto do Excel do quadro. Hoje o maior quadro (0300) tem ~8 mil cards.
  MAX_EXPORT_ROWS = 20_000
  # Excel com as conversas: ids por chamada e tamanho do texto por conversa
  # (a celula do Excel aceita 32.767 caracteres).
  MAX_TRANSCRIPT_IDS = 500
  MAX_TRANSCRIPT_CHARS = 30_000

  before_action :set_inbox

  def show
    pages = column_pages(filtered_by_status(accessible_conversations(@inbox)))
    unread = unread_counts(pages.values.flat_map { |page| page[:rows] })
    render json: {
      per_page: per_page,
      unstaged_key: UNSTAGED_KEY,
      columns: pages.transform_values { |page| { total: page[:total], payload: page[:rows].map { |c| card(c, unread[c.id]) } } }
    }
  end

  # GET /api/v1/accounts/:account_id/kanban_board/day
  #     ?inbox_id=11&labels[]=sdr&exclude_labels[]=importado&unstaged=1&status=all&mode=created&date=2026-11-09
  #
  # 09/11/2026: as telas Criados e Atualizados do Kanban precisavam de TODAS as
  # conversas do quadro (loadEverything: 25 por pagina pelo /conversations/filter,
  # 1 a 1,6 s cada, centenas de paginas no 0300) so para mostrar as do dia.
  # Aqui sai so o dia pedido, numa consulta: as conversas do quadro (com etapa,
  # ou sem etapa quando o funil tem essa coluna, sempre sem as exclude_labels)
  # criadas (mode=created) ou com ultima atividade (mode=updated) no dia, no
  # fuso de Sao Paulo, mais recentes primeiro. Mesmo card do show.
  def day
    start = day_start
    return render json: { error: 'Data inválida' }, status: :unprocessable_entity if start.nil?

    render json: day_payload(@inbox, start)
  end

  # GET /api/v1/accounts/:account_id/kanban_board/cards
  #     ?inbox_id=11&labels[]=sdr&exclude_labels[]=importado&unstaged=1&status=all
  #
  # 09/11/2026: o Excel do Kanban paginava cada coluna de 25 em 25 pelo
  # /conversations/filter ate MAX_PAGES_PER_COLUMN (200) — cortava em 5.000
  # cards por coluna (o SDR do 0300 tem ~5.300) e levava minutos. Aqui sai o
  # quadro inteiro numa consulta, no mesmo card do show, ate MAX_EXPORT_ROWS.
  # Sem contagem de nao lidas: o Excel nao usa.
  def cards
    scope = funnel_scope(filtered_by_status(accessible_conversations(@inbox)))
    total = scope.count
    rows = scope.sort_on_last_activity_at(:desc).limit(MAX_EXPORT_ROWS)
                .includes(:contact, :assignee, :assignee_agent_bot).to_a.uniq(&:id)
    render json: { total: total, truncated: total > rows.size, payload: rows.map { |c| card(c, 0) } }
  end

  # POST /api/v1/accounts/:account_id/kanban_board/transcripts
  #      { inbox_id: 11, ids: [display_id, ...] }  (ate MAX_TRANSCRIPT_IDS)
  #
  # 11/11/2026: botao "Conversas" do Kanban — o Excel com o texto de cada
  # conversa, para a equipe consultar fora do Chatwoot. Devolve
  # { payload: { display_id => "[dd/mm/aa hh:mm] Cliente: ..." } }, so mensagens
  # publicas de cliente e escritorio, na ordem. Mesmo filtro de permissao do quadro.
  def transcripts
    conversations = accessible_conversations(@inbox).where(display_id: Array(params[:ids]).map(&:to_i).first(MAX_TRANSCRIPT_IDS))
    render json: { payload: transcript_texts(conversations.pluck(:id, :display_id).to_h) }
  end

  private

  def transcript_texts(display_ids)
    texts = Hash.new { |hash, key| hash[key] = +'' }
    transcript_messages(display_ids.keys).each do |conversation_id, message_type, content, created_at|
      text = texts[display_ids[conversation_id]]
      text << transcript_line(message_type, content, created_at) if text.length <= MAX_TRANSCRIPT_CHARS
    end
    texts.transform_values { |text| text.truncate(MAX_TRANSCRIPT_CHARS) }
  end

  def transcript_messages(conversation_ids)
    Message.unscoped
           .where(account_id: Current.account.id, conversation_id: conversation_ids, private: false, message_type: %i[incoming outgoing])
           .where.not(content: [nil, ''])
           .order(:conversation_id, :created_at)
           .pluck(:conversation_id, :message_type, :content, :created_at)
  end

  def transcript_line(message_type, content, created_at)
    who = message_type.to_s == 'incoming' ? 'Cliente' : 'Escritório'
    "[#{created_at.in_time_zone(DAY_ZONE).strftime('%d/%m/%y %H:%M')}] #{who}: #{content.squish}\n"
  end

  def set_inbox
    @inbox = Current.user.assigned_inboxes.find_by(id: params[:inbox_id])
    render json: { error: 'Caixa não encontrada' }, status: :not_found if @inbox.nil?
  end

  def day_payload(inbox, start)
    column = params[:mode] == 'updated' ? :last_activity_at : :created_at
    scope = funnel_scope(filtered_by_status(accessible_conversations(inbox)))
            .where(conversations: { column => start...(start + 1.day) })
    total = scope.count
    rows = scope.order(column => :desc).limit(MAX_DAY_ROWS).includes(:contact, :assignee, :assignee_agent_bot).to_a.uniq(&:id)
    unread = unread_counts(rows)
    { date: start.to_date.iso8601, mode: column == :last_activity_at ? 'updated' : 'created',
      total: total, truncated: total > rows.size, payload: rows.map { |c| card(c, unread[c.id]) } }
  end

  # O quadro inteiro: as colunas de etapa e, se o funil tem, a Sem etapa — que
  # juntas sao toda conversa sem exclude_labels. Sem etapa e sem a coluna Sem
  # etapa, nada.
  def funnel_scope(base)
    return base.none if stage_labels.empty? && !unstaged?

    scope = unstaged? ? base : base.tagged_with(stage_labels, any: true)
    exclude_labels.any? ? scope.tagged_with(exclude_labels, exclude: true) : scope
  end

  def day_start
    date = Date.iso8601(params[:date].to_s)
    ActiveSupport::TimeZone[DAY_ZONE].local(date.year, date.month, date.day)
  rescue ArgumentError, Date::Error
    nil
  end

  def column_pages(base)
    pages = stage_labels.index_with { |label| page_of(with_label(base, label)) }
    pages[UNSTAGED_KEY] = page_of(base.tagged_with(stage_labels + exclude_labels, exclude: true)) if unstaged?
    pages
  end

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
