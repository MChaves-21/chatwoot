require 'rails_helper'

# Relatorio da Equipe (fork Goncalves & Silva). Fuso padrao: America/Fortaleza (UTC-3).
RSpec.describe RelatorioEquipe::Report do
  let(:account) { create(:account) }
  let(:inbox) { create(:inbox, account: account) }
  let(:other_inbox) { create(:inbox, account: account) }
  let(:agent) { create(:user, account: account, role: :agent, name: 'Karol') }
  let(:ia_user) { create(:user, account: account, role: :agent, name: 'Juliana IA') }
  let(:bot) { create(:agent_bot, name: 'Robo') }
  let(:contact) { create(:contact, account: account, name: 'Ana Cliente', phone_number: '+5585999990001') }
  let(:conversation) { create(:conversation, account: account, inbox: inbox, contact: contact) }
  let(:unanswered) { create(:conversation, account: account, inbox: other_inbox) }
  # Janeiro de proposito: mensagens automaticas que o Chatwoot cria "agora" ficam fora.
  let(:params) { { since: '2026-01-03', until: '2026-01-04' } }
  let(:report) { described_class.new(account: account, params: params.with_indifferent_access, ia_user_ids: [ia_user.id]) }

  # Hora de Fortaleza.
  def at(day, hour, min = 0)
    Time.find_zone('America/Fortaleza').local(2026, 1, day, hour, min)
  end

  def message(attrs)
    create(:message, { account: account, inbox: attrs[:conversation].inbox }.merge(attrs))
  end

  before do
    conversation.update_labels(['sdr'])
    message(conversation: conversation, message_type: :incoming, sender: contact, content: 'oi', created_at: at(3, 9))
    message(conversation: conversation, message_type: :outgoing, sender: agent, content: 'ola', created_at: at(3, 10))
    message(conversation: conversation, message_type: :outgoing, sender: ia_user, content: 'resposta da IA', created_at: at(4, 9))
    message(conversation: conversation, message_type: :outgoing, sender: bot, content: '=CMD()', created_at: at(4, 9, 5))
    create(:message, :bot_message, account: account, inbox: inbox, conversation: conversation,
                                   content: 'do celular', created_at: at(4, 9, 10))
    # Fora da conta: nota privada, atividade e mensagem antes do periodo.
    message(conversation: conversation, message_type: :outgoing, sender: agent, private: true, content: 'nota', created_at: at(4, 11))
    message(conversation: conversation, message_type: :activity, content: 'Karol adicionou sdr', created_at: at(4, 11))
    message(conversation: conversation, message_type: :incoming, sender: contact, content: 'antiga', created_at: at(1, 9) - 1.month)
    message(conversation: unanswered, message_type: :incoming, content: 'alguem?', created_at: at(4, 8))
  end

  describe '#summary' do
    it 'classifica as mensagens em cliente, equipe, IA e sem autor' do
      expect(report.summary[:totals][:mensagens]).to eq('recebida' => 2, 'humano' => 1, 'ia' => 2, 'sem_autor' => 1)
    end

    it 'conta conversas, respondidas pela equipe e pela IA e sem resposta' do
      totals = report.summary[:totals]
      expect(totals).to include(conversas: 2, conversas_com_cliente: 2, conversas_equipe: 1,
                                conversas_ia: 1, conversas_sem_resposta: 1)
    end

    it 'agrupa por dia no fuso de Fortaleza, com todos os dias do periodo' do
      expect(report.summary[:per_day]).to eq([
                                               { date: '2026-01-03', 'recebida' => 1, 'humano' => 1, 'ia' => 0, 'sem_autor' => 0 },
                                               { date: '2026-01-04', 'recebida' => 1, 'humano' => 0, 'ia' => 2, 'sem_autor' => 1 }
                                             ])
    end

    it 'mensagem das 22h de Fortaleza conta no proprio dia, nao no seguinte (UTC)' do
      message(conversation: conversation, message_type: :incoming, sender: contact, content: 'noite', created_at: at(3, 22))
      day = report.summary[:per_day].find { |d| d[:date] == '2026-01-03' }
      expect(day['recebida']).to eq(2)
    end

    it 'lista por usuario e marca IA (usuario marcado e bot)' do
      rows = report.summary[:per_user]
      expect(rows).to contain_exactly(
        include(id: agent.id, tipo: 'User', name: 'Karol', ia: false, mensagens: 1, conversas: 1),
        include(id: ia_user.id, tipo: 'User', name: 'Juliana IA', ia: true, mensagens: 1, conversas: 1),
        include(id: bot.id, tipo: 'AgentBot', name: 'Robo', ia: true, mensagens: 1, conversas: 1)
      )
    end

    it 'sem usuarios marcados como IA, a Juliana conta como equipe' do
      plain = described_class.new(account: account, params: params.with_indifferent_access, ia_user_ids: [])
      expect(plain.summary[:totals][:mensagens]).to include('humano' => 2, 'ia' => 1)
    end

    it 'devolve o periodo e o fuso' do
      expect(report.summary[:period]).to eq(since: '2026-01-03', until: '2026-01-04', tz: 'America/Fortaleza')
    end
  end

  describe 'filtros' do
    def summary_with(extra)
      described_class.new(account: account, params: params.merge(extra).with_indifferent_access,
                          ia_user_ids: [ia_user.id]).summary
    end

    it 'por caixa' do
      expect(summary_with(inbox_ids: [other_inbox.id])[:totals][:mensagens])
        .to eq('recebida' => 1, 'humano' => 0, 'ia' => 0, 'sem_autor' => 0)
    end

    it 'caixa de outra conta nao vira "todas": a lista fica vazia' do
      foreign = create(:inbox)
      expect(summary_with(inbox_ids: [foreign.id])[:totals][:conversas]).to eq(0)
    end

    it 'por usuario: so as conversas que ele respondeu e so ele na tabela' do
      summary = summary_with(user_ids: [agent.id])
      expect(summary[:totals][:conversas]).to eq(1)
      expect(summary[:per_user].pluck(:id)).to eq([agent.id])
    end

    it 'por etiqueta (a de hoje) e ignora etiqueta invalida' do
      expect(summary_with(labels: ['sdr'])[:totals][:conversas]).to eq(1)
      expect(summary_with(labels: ['nao existe'])[:totals][:conversas]).to eq(2)
    end
  end

  describe 'periodo' do
    def period(extra)
      described_class.new(account: account, params: extra.with_indifferent_access, ia_user_ids: [])
    end

    it 'datas invertidas sao trocadas' do
      r = period(since: '2026-11-04', until: '2026-11-03')
      expect([r.since_date.iso8601, r.until_date.iso8601]).to eq(%w[2026-11-03 2026-11-04])
    end

    it 'mais de 366 dias e cortado' do
      r = period(since: '2020-01-01', until: '2026-11-04')
      expect((r.until_date - r.since_date).to_i).to eq(365)
    end

    it 'sem datas: ultimos 30 dias ate hoje no fuso de Fortaleza' do
      travel_to(Time.utc(2026, 11, 5, 2, 0)) do # 04/11 23h em Fortaleza
        r = period({})
        expect(r.until_date.iso8601).to eq('2026-11-04')
        expect(r.since_date.iso8601).to eq('2026-10-06')
      end
    end

    it 'data invalida cai no padrao e fuso invalido cai em Fortaleza' do
      r = period(since: 'ontem', until: '2026-11-04', tz: 'Marte/Base')
      expect(r.since_date.iso8601).to eq('2026-10-06')
      expect(r.tz.tzinfo.identifier).to eq('America/Fortaleza')
    end
  end

  describe '#to_csv' do
    let(:csv) { report.to_csv }
    let(:lines) { csv.first.delete_prefix("﻿").lines.map(&:chomp) }

    it 'tem BOM, separador ";" e nao esta truncado' do
      expect(csv.first).to start_with("﻿")
      expect(csv.last).to be(false)
      expect(lines.first).to eq('Data/hora;Caixa;Conversa;Contato;Telefone;Quem enviou;Tipo;Etiquetas;Mensagem')
    end

    it 'uma linha por mensagem, em ordem, com quem enviou' do
      body = lines.drop(1)
      expect(body.size).to eq(6)
      expect(body.first).to start_with('03/01/2026 09:00:00;')
      expect(body.first).to include(';Ana Cliente;+5585999990001;Ana Cliente;Cliente;sdr;oi')
      expect(body).to include(a_string_including(';Karol;Equipe;'))
      expect(body).to include(a_string_including(';Juliana IA;IA/automação;'))
      expect(body).to include(a_string_including(';Sem autor (celular/integração);Sem autor (celular/integração);'))
    end

    it 'celula que comecaria formula no Excel ganha apostrofo' do
      expect(lines).to include(a_string_including(";Robo;IA/automação;sdr;'=CMD()"))
    end
  end

  describe '.safe_cell' do
    it 'protege = + - @ e caracteres de controle no inicio' do
      %w[=1 +1 -1 @1].each { |v| expect(described_class.safe_cell(v)).to eq("'#{v}") }
      expect(described_class.safe_cell("\tx")).to eq("'\tx")
      expect(described_class.safe_cell('ok=1')).to eq('ok=1')
      expect(described_class.safe_cell(5)).to eq(5)
      expect(described_class.safe_cell(nil)).to be_nil
    end
  end
end
