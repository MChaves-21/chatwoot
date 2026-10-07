# Dashboard IA (fork Goncalves & Silva) — funcoes puras, sem ActiveRecord.
#
# Ficam separadas do controller de proposito: da para testar com `ruby` puro,
# sem subir o Rails. Tudo aqui recebe e devolve String/Integer/Hash.
module DashboardIa::HistoryParser
  # Texto da atividade de etiqueta (config/locales, conversations.activity.labels.added):
  #   pt_BR: "%{user_name} adicionou %{labels}"     en: "%{user_name} added %{labels}"
  # As etiquetas vem separadas por virgula. O nome do usuario pode ter espaco,
  # entao o que vale e o que vem DEPOIS do verbo.
  ADDED = /\s(?:adicionou|added)\s+(.+)\z/m
  # Etiqueta do Chatwoot: minusculas, digitos, _ e -. Descarta "política de SLA X".
  LABEL = /\A[a-z0-9_-]+\z/

  module_function

  # Etiquetas ADICIONADAS numa mensagem de atividade; [] se nao for o caso.
  def added_labels(content)
    match = ADDED.match(content.to_s.strip)
    return [] unless match

    labels = match[1].split(',').map(&:strip)
    labels.all? { |label| LABEL.match?(label) } ? labels : []
  end

  # events: [[conversation_id, content, created_at_epoch], ...]
  # Devolve { conversation_id => { etiqueta => epoch da PRIMEIRA vez } }.
  def first_seen(events)
    out = {}
    events.each do |conversation_id, content, at|
      added_labels(content).each do |label|
        seen = (out[conversation_id] ||= {})
        seen[label] = at if seen[label].nil? || at < seen[label]
      end
    end
    out
  end

  # DDD (2 digitos) de um telefone brasileiro; nil para numero curto ou de fora.
  # So o DDD sai do servidor: o painel precisa do estado, nao do telefone.
  def ddd(phone)
    text = phone.to_s.strip
    digits = text.gsub(/\D/, '')
    if digits.start_with?('55') && digits.length.between?(12, 13)
      digits = digits[2..]
    elsif text.start_with?('+')
      return nil
    end
    return nil unless digits.length.between?(10, 11)

    digits[0, 2]
  end

  # Metas por funil: so chaves curtas e inteiros positivos. Qualquer outra coisa cai fora.
  def clean_goals(raw)
    return {} unless raw.respond_to?(:each_pair)

    raw.each_pair.with_object({}) do |(key, value), out|
      name = key.to_s
      number = Integer(value, exception: false)
      next unless name.match?(/\A[a-z0-9_]{1,40}\z/) && number && number.between?(1, 100_000)

      out[name] = number
    end
  end
end
