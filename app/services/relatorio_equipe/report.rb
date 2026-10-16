# Relatorio da Equipe (fork Goncalves & Silva).
#
# Mensagens enviadas x recebidas por dia, mensagens por usuario, IA x humano
# e quantas conversas cada usuario RESPONDEU no periodo. Tambem gera o CSV
# com a lista das mensagens.
#
# So leitura: nao cria nem altera conversa, mensagem ou etiqueta. Quem chama
# (RelatorioEquipeController) ja conferiu que e administrador.
#
# Como cada mensagem e classificada:
#   recebida   message_type incoming (o cliente escreveu)
#   ia         enviada por AgentBot/Captain, OU por um usuario marcado como IA
#              na tela (o n8n envia com o token de um usuario do Chatwoot, entao
#              so pelo sender_type nao da para separar a Juliana da equipe)
#   humano     enviada por usuario que nao esta marcado como IA
#   sem_autor  enviada sem remetente: direto do celular ou por integracao
# Notas privadas e mensagens de atividade ficam de fora.
class RelatorioEquipe::Report
  MAX_DAYS = 366
  DEFAULT_DAYS = 30
  CSV_LIMIT = 50_000
  CONTENT_LIMIT = 2_000
  DEFAULT_TZ = 'America/Fortaleza'.freeze
  IA_SENDER_TYPES = %w[AgentBot Captain::Assistant].freeze
  INCOMING = 0
  OUT_TYPES = [1, 3].freeze # outgoing, template
  CHAT_TYPES = ([INCOMING] + OUT_TYPES).freeze
  CATEGORIES = %w[recebida humano ia sem_autor].freeze
  CATEGORY_TITLES = {
    'recebida' => 'Cliente',
    'humano' => 'Equipe',
    'ia' => 'IA/automação',
    'sem_autor' => 'Sem autor (celular/integração)'
  }.freeze
  LABEL = /\A[[:alnum:]_-]+\z/

  attr_reader :tz, :since_date, :until_date

  def initialize(account:, params:, ia_user_ids:)
    @account = account
    @tz = ActiveSupport::TimeZone[params[:tz].to_s] || ActiveSupport::TimeZone[DEFAULT_TZ]
    read_period(params)
    @inbox_ids = scoped_ids(params[:inbox_ids]) { |ids| account.inboxes.where(id: ids).pluck(:id) }
    @user_ids = scoped_ids(params[:user_ids]) { |ids| account.users.where(id: ids).pluck(:id) }
    @labels = Array(params[:labels]).map { |l| l.to_s.strip }.select { |l| LABEL.match?(l) }.uniq.first(20)
    @ia_user_ids = Array(ia_user_ids).map(&:to_i).uniq
  end

  def summary
    {
      period: { since: since_date.iso8601, until: until_date.iso8601, tz: tz.tzinfo.identifier },
      totals: totals,
      per_day: per_day,
      per_user: per_user
    }
  end

  # [csv, truncado?]
  def to_csv
    require 'csv'
    rows = csv_rows
    names = sender_names(rows)
    csv = CSV.generate(col_sep: ';') do |out|
      out << ['Data/hora', 'Caixa', 'Conversa', 'Contato', 'Telefone', 'Quem enviou', 'Tipo', 'Etiquetas', 'Mensagem']
      rows.each { |row| out << csv_line(row, names) }
    end
    ["\uFEFF#{csv}", rows.size >= CSV_LIMIT]
  end

  private

  attr_reader :account

  def read_period(params)
    @until_date = parse_date(params[:until]) || tz.today
    @since_date = parse_date(params[:since]) || (@until_date - (DEFAULT_DAYS - 1))
    @since_date, @until_date = @until_date, @since_date if @since_date > @until_date
    @since_date = @until_date - (MAX_DAYS - 1) if (@until_date - @since_date).to_i >= MAX_DAYS
  end

  def parse_date(value)
    Date.iso8601(value.to_s)
  rescue ArgumentError
    nil
  end

  # nil = sem filtro. Pediu ids e nenhum e desta conta = lista vazia (nada),
  # nunca "todos".
  def scoped_ids(raw)
    asked = Array(raw).filter_map { |id| Integer(id, exception: false) }.uniq.first(50)
    return nil if asked.empty?

    yield(asked)
  end

  def range
    tz.local(since_date.year, since_date.month, since_date.day).beginning_of_day..
      tz.local(until_date.year, until_date.month, until_date.day).end_of_day
  end

  # Mensagens de chat do periodo, ja com os filtros.
  def messages
    @messages ||= begin
      scope = base_messages.where(message_type: CHAT_TYPES)
      scope = scope.where(inbox_id: @inbox_ids) if @inbox_ids
      scope = scope.where(conversation_id: labeled_conversation_ids) if @labels.any?
      # Filtro de usuario: as conversas que ele respondeu no periodo.
      scope = scope.where(conversation_id: user_messages.select(:conversation_id)) if @user_ids
      scope
    end
  end

  def base_messages
    Message.unscoped.where(account_id: account.id, private: false, created_at: range)
  end

  def user_messages
    base_messages.where(message_type: OUT_TYPES, sender_type: 'User', sender_id: @user_ids)
  end

  # Conversas com qualquer uma das etiquetas. Direto na tabela de taggings:
  # o `tagged_with(any: true)` do acts-as-taggable monta um SELECT que nao
  # serve de subconsulta (dava erro 500, visto em producao em 16/10/2026).
  # Restringir a conta nao e preciso aqui: `messages` ja filtra account_id.
  def labeled_conversation_ids
    ActsAsTaggableOn::Tagging.joins(:tag)
                             .where(taggable_type: 'Conversation', context: 'labels', tags: { name: @labels })
                             .select(:taggable_id)
  end

  def outgoing
    messages.where(message_type: OUT_TYPES)
  end

  def category_sql
    @category_sql ||= begin
      ia_users = @ia_user_ids.any? ? "OR (messages.sender_type = 'User' AND messages.sender_id IN (#{@ia_user_ids.join(',')}))" : ''
      bots = IA_SENDER_TYPES.map { |t| ActiveRecord::Base.connection.quote(t) }.join(', ')
      <<~SQL.squish
        CASE
          WHEN messages.message_type = #{INCOMING} THEN 'recebida'
          WHEN messages.sender_type IN (#{bots}) #{ia_users} THEN 'ia'
          WHEN messages.sender_type = 'User' THEN 'humano'
          ELSE 'sem_autor'
        END
      SQL
    end
  end

  def day_sql
    zone = ActiveRecord::Base.connection.quote(tz.tzinfo.identifier)
    "TO_CHAR((messages.created_at AT TIME ZONE 'UTC') AT TIME ZONE #{zone}, 'YYYY-MM-DD')"
  end

  def totals
    by_category = messages.group(Arel.sql(category_sql)).count
    replied = outgoing.select(:conversation_id)
    {
      mensagens: CATEGORIES.index_with { |c| by_category[c] || 0 },
      conversas: messages.distinct.count(:conversation_id),
      conversas_com_cliente: messages.where(message_type: INCOMING).distinct.count(:conversation_id),
      conversas_equipe: outgoing.where(Arel.sql("(#{category_sql}) = 'humano'")).distinct.count(:conversation_id),
      conversas_ia: outgoing.where(Arel.sql("(#{category_sql}) = 'ia'")).distinct.count(:conversation_id),
      conversas_sem_resposta: messages.where(message_type: INCOMING).where.not(conversation_id: replied)
                                      .distinct.count(:conversation_id)
    }
  end

  def per_day
    counts = messages.group(Arel.sql(day_sql), Arel.sql(category_sql)).count
    (since_date..until_date).map do |day|
      key = day.iso8601
      CATEGORIES.each_with_object({ date: key }) { |c, row| row[c] = counts[[key, c]] || 0 }
    end
  end

  def per_user
    users = outgoing.where(sender_type: 'User')
    users = users.where(sender_id: @user_ids) if @user_ids
    rows = sender_rows(users, User, 'User')
    rows += sender_rows(outgoing.where(sender_type: 'AgentBot'), AgentBot, 'AgentBot') unless @user_ids
    rows.sort_by { |r| [-r[:conversas], -r[:mensagens]] }
  end

  def sender_rows(scope, model, type)
    msgs = scope.group(:sender_id).count
    convs = scope.group(:sender_id).distinct.count(:conversation_id)
    names = model.where(id: msgs.keys).pluck(:id, :name).to_h
    msgs.map do |id, total|
      {
        id: id,
        tipo: type,
        name: names[id].presence || "#{type == 'User' ? 'Usuário' : 'Bot'} #{id}",
        ia: type != 'User' || @ia_user_ids.include?(id),
        mensagens: total,
        conversas: convs[id] || 0
      }
    end
  end

  CSV_COLUMNS = [
    'messages.created_at', 'inboxes.name', 'messages.conversation_id', 'contacts.name', 'contacts.phone_number',
    'messages.sender_type', 'messages.sender_id', nil, 'conversations.cached_label_list', 'messages.content'
  ].freeze

  def csv_rows
    columns = CSV_COLUMNS.map { |c| Arel.sql(c || category_sql) }
    messages.left_joins(:inbox, conversation: :contact)
            .reorder(Arel.sql('messages.created_at ASC, messages.id ASC'))
            .limit(CSV_LIMIT)
            .pluck(*columns)
  end

  def sender_names(rows)
    ids = Hash.new { |h, k| h[k] = [] }
    rows.each { |row| ids[row[5]] << row[6] if row[6] }
    {
      'User' => User.where(id: ids['User'].uniq).pluck(:id, :name).to_h,
      'AgentBot' => AgentBot.where(id: ids['AgentBot'].uniq).pluck(:id, :name).to_h
    }
  end

  def csv_line(row, names)
    at, inbox, conversation_id, contact, phone, sender_type, sender_id, category, labels, content = row
    sender = category == 'recebida' ? contact : (names.dig(sender_type, sender_id) || CATEGORY_TITLES[category])
    [
      at&.in_time_zone(tz)&.strftime('%d/%m/%Y %H:%M:%S'),
      inbox,
      conversation_id,
      contact,
      phone,
      sender,
      CATEGORY_TITLES[category],
      labels,
      content.to_s.truncate(CONTENT_LIMIT)
    ].map { |cell| RelatorioEquipe::Report.safe_cell(cell) }
  end

  # Celula que comeca com = + - @ vira formula no Excel. Prefixa com '.
  def self.safe_cell(cell)
    return cell unless cell.is_a?(String)

    cell.match?(/\A[=+\-@\t\r]/) ? "'#{cell}" : cell
  end
end
