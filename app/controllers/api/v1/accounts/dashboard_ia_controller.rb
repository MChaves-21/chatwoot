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
  include ForkAdministratorOnly

  GOALS_KEY = 'dashboard_ia_goals'.freeze
  MAX_INBOXES = 20
  SNAPSHOT_TTL = 2.minutes
  # 09/11/2026: o historico de etiquetas varria TODAS as mensagens de atividade
  # das caixas, desde sempre, com regex (sem indice). As metas e graficos sao
  # mensais; 400 dias cobrem o ano corrente e o anterior com folga.
  HISTORY_DAYS = ENV.fetch('DASHBOARD_IA_HISTORY_DAYS', '400').to_i
  LABEL_FORMAT = /\A[a-z0-9_-]{1,60}\z/
  MAX_SIGNED_LABELS = 100
  # Reserva para a tela antiga, que nao manda `signed_labels[]`. A lista certa
  # vem do front (FUNNEL_READING: de `signedFrom` ate o fim de cada funil, mais
  # `rankAs`), que e a fonte unica desde 09/11/2026. Esta copia ja tinha ficado
  # para tras: nao tinha trab_contrato_assinado nem trab_efetivado.
  DEFAULT_SIGNED_LABELS = (
    %w[contrato_assinado analise_medica analise_juridica efetivado pegar_senha pos_juridica
       reprovado_dr_gerardo aprovado_repescagem].flat_map { |label| [label, "bpc_#{label}"] } +
    %w[trab_contrato_assinado trab_efetivado]
  ).freeze

  # 05/11/2026: o retrato fica em cache por SNAPSHOT_TTL. Sem isso, cada
  # abertura relia todas as conversas das caixas e varria todas as mensagens de
  # atividade com regex, sem limite de data — custo que so cresce. As metas
  # ficam fora do cache: quem salva quer ver a meta nova na hora.
  # `?refresh=1` ignora o cache.
  def show
    ids = inbox_ids
    snapshot = Rails.cache.fetch(snapshot_cache_key(ids), expires_in: SNAPSHOT_TTL, force: params[:refresh].present?) do
      conversations = conversation_rows(ids)
      {
        rows: conversations,
        agents: agent_names(conversations),
        stages: stage_history(ids),
        closings: closing_rows(ids),
        generated_at: Time.current.to_i
      }
    end
    render json: snapshot.merge(goals: stored_goals)
  end

  def goals
    cleaned = DashboardIa::HistoryParser.clean_goals(params[:goals].respond_to?(:to_unsafe_h) ? params[:goals].to_unsafe_h : {})
    merged = AccountSettingsStore.write(Current.account, GOALS_KEY) do |current|
      DashboardIa::HistoryParser.clean_goals(current).merge(cleaned)
    end
    render json: { goals: merged }
  end

  private

  def fork_screen_name
    'o Dashboard IA'
  end

  # So caixas desta conta; id de outra conta e descartado em silencio.
  def inbox_ids
    asked = Array(params[:inbox_ids]).filter_map { |id| Integer(id, exception: false) }.uniq.first(MAX_INBOXES)
    Current.account.inboxes.where(id: asked).pluck(:id)
  end

  # O "id" que sai daqui e sempre o display_id: e o numero que a API e as
  # rotas do Chatwoot usam (/conversations/:id). O id do banco so coincide com
  # ele enquanto a conta 1 era a unica com conversas; desde as contas 2 e 3
  # (out/2026) os dois divergem e o link "Abrir a conversa" abria outra
  # conversa (26/10/2026).
  #
  # [id, inbox_id, etiquetas, criada, ultima atividade, responsavel, ddd]
  def conversation_rows(ids)
    Current.account.conversations
           .where(inbox_id: ids)
           .left_joins(:contact)
           .pluck(:display_id, :inbox_id, :cached_label_list, :created_at, :last_activity_at, :assignee_id, 'contacts.phone_number')
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

  # Fechamentos: quem fechou o contrato (IA, Equipe ou Fora do Chatwoot) e
  # quando assinou. Os atributos sao gravados na conversa pelo fluxo
  # "Comunicar do Contrato Assinado" do n8n (19/10/2026).
  # Entram tambem as conversas que estao em contrato assinado (ou etapa
  # posterior) sem o atributo: etapa movida a mao, contrato fechado fora do
  # fluxo automatico. Para essas os campos vem nulos e a tela usa a data em
  # que a etiqueta foi aplicada.
  # [id, inbox_id, cliente, fechado_por, assinado_em, assinado_hora, horario]
  def closing_rows(ids)
    Current.account.conversations
           .where(inbox_id: ids)
           .where("conversations.custom_attributes ->> 'fechado_por' IS NOT NULL OR conversations.cached_label_list ~ ?", signed_labels_regex)
           .left_joins(:contact)
           .pluck(:display_id, :inbox_id, 'contacts.name', 'conversations.custom_attributes')
           .map do |id, inbox_id, name, attrs|
      attrs ||= {}
      [id, inbox_id, name, attrs['fechado_por'], attrs['assinado_em'], attrs['assinado_hora'], attrs['horario_assinatura']]
    end
  end

  def agent_names(conversations)
    ids = conversations.filter_map { |row| row[5] }.uniq
    User.where(id: ids).pluck(:id, :name).to_h
  end

  # { display_id da conversa => { etiqueta => epoch da primeira vez } }
  def stage_history(ids)
    display_ids = Current.account.conversations.where(inbox_id: ids).pluck(:id, :display_id).to_h
    events = Message.unscoped.where(account_id: Current.account.id, inbox_id: ids, message_type: :activity)
                    .where(created_at: HISTORY_DAYS.days.ago..)
                    .where('content ~* ?', '\\s(adicionou|added)\\s')
                    .pluck(:conversation_id, :content, :created_at)
                    .map { |conversation_id, content, created_at| [display_ids[conversation_id], content, created_at.to_i] }
    DashboardIa::HistoryParser.first_seen(events)
  end

  # Etiquetas de contrato assinado ou etapa posterior, mandadas pela tela
  # (`signed_labels[]`). So formato de etiqueta passa; sem nenhuma valida, a reserva.
  def signed_labels
    @signed_labels ||= begin
      asked = Array(params[:signed_labels]).map { |label| label.to_s.strip }.grep(LABEL_FORMAT).uniq.first(MAX_SIGNED_LABELS)
      asked.presence || DEFAULT_SIGNED_LABELS
    end
  end

  def signed_labels_regex
    "(^|,)\\s*(#{signed_labels.map { |label| Regexp.escape(label) }.join('|')})\\s*(,|$)"
  end

  # A lista de etiquetas muda os fechamentos, entao entra na chave do cache.
  def snapshot_cache_key(ids)
    "dashboard_ia/snapshot/v2/#{Current.account.id}/#{ids.sort.join('-')}/#{Digest::SHA1.hexdigest(signed_labels.sort.join(','))[0, 12]}"
  end

  def stored_goals
    DashboardIa::HistoryParser.clean_goals(AccountSettingsStore.read(Current.account, GOALS_KEY))
  end
end
