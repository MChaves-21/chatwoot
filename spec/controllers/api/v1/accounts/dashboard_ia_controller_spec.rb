require 'rails_helper'

# Dashboard IA (fork Goncalves & Silva).
RSpec.describe 'Dashboard IA API', type: :request do
  let(:account) { create(:account) }
  let(:admin) { create(:user, account: account, role: :administrator) }
  let(:agent) { create(:user, account: account, role: :agent, name: 'Karol') }
  let(:inbox) { create(:inbox, account: account) }
  let(:bpc_inbox) { create(:inbox, account: account) }
  let(:outside_inbox) { create(:inbox, account: account) }
  let(:base_url) { "/api/v1/accounts/#{account.id}/dashboard_ia" }

  def show(user, inbox_ids)
    get base_url, params: { inbox_ids: inbox_ids }, headers: user.create_new_auth_token
  end

  describe 'GET /api/v1/accounts/:account_id/dashboard_ia' do
    it 'sem login: 401' do
      get base_url
      expect(response).to have_http_status(:unauthorized)
    end

    it 'agente: 403, numeros comerciais sao so de administrador' do
      show(agent, [inbox.id])
      expect(response).to have_http_status(:forbidden)
      expect(response.parsed_body['error']).to eq('Apenas administradores acessam o Dashboard IA')
    end

    context 'com administrador' do
      # Conversas em outra conta antes: assim o id do banco e o display_id divergem,
      # como em producao desde as contas 2 e 3 (26/10/2026).
      let!(:noise) { create_list(:conversation, 3) }
      let(:contact) { create(:contact, account: account, phone_number: '+5585999990001', name: 'Ana') }
      let!(:signed) do
        create(:conversation, account: account, inbox: inbox, contact: contact, assignee: agent,
                              custom_attributes: { 'fechado_por' => 'IA', 'assinado_em' => '2026-11-02',
                                                   'assinado_hora' => '10:15', 'horario_assinatura' => 'Comercial' })
      end
      let!(:manual) { create(:conversation, account: account, inbox: bpc_inbox) }
      let!(:lead) { create(:conversation, account: account, inbox: inbox) }
      let!(:hidden) { create(:conversation, account: account, inbox: outside_inbox) }

      before do
        signed.update_labels(%w[contrato_assinado urgente])
        manual.update_labels(['bpc_contrato_assinado'])
        lead.update_labels(['sdr'])
        hidden.update_labels(['contrato_assinado'])
        create(:message, account: account, inbox: inbox, conversation: signed, message_type: :activity,
                         content: 'Karol adicionou sdr', created_at: Time.zone.parse('2026-10-31 22:00 -03:00'))
        create(:message, account: account, inbox: inbox, conversation: signed, message_type: :activity,
                         content: 'Karol adicionou contrato_assinado, urgente', created_at: Time.zone.parse('2026-11-02 10:15 -03:00'))
        create(:message, account: account, inbox: inbox, conversation: signed, message_type: :activity,
                         content: 'Karol adicionou contrato_assinado', created_at: Time.zone.parse('2026-11-03 10:00 -03:00'))
        create(:message, account: account, inbox: inbox, conversation: signed, message_type: :activity,
                         content: 'Karol removeu sdr', created_at: Time.zone.parse('2026-11-01 10:00 -03:00'))
      end

      it 'uma linha enxuta por conversa das caixas pedidas, com o display_id' do
        show(admin, [inbox.id, bpc_inbox.id])
        expect(response).to have_http_status(:success)
        rows = response.parsed_body['rows']
        expect(rows.size).to eq(3)
        row = rows.find { |r| r[0] == signed.display_id }
        expect(signed.display_id).not_to eq(signed.id)
        signed.reload
        expect(row.values_at(0, 1, 3, 4, 5, 6)).to eq([signed.display_id, inbox.id, signed.created_at.to_i,
                                                        signed.last_activity_at.to_i, agent.id, '85'])
        expect(row[2]).to match_array(%w[contrato_assinado urgente])
        expect(rows.map(&:first)).not_to include(hidden.display_id)
      end

      it 'nao devolve o telefone, so o DDD' do
        show(admin, [inbox.id])
        expect(response.body).not_to include('999990001')
      end

      it 'nomes dos responsaveis' do
        show(admin, [inbox.id])
        expect(response.parsed_body['agents']).to eq(agent.id.to_s => 'Karol')
      end

      it 'historico: a PRIMEIRA vez de cada etiqueta, por display_id' do
        show(admin, [inbox.id])
        stages = response.parsed_body['stages'][signed.display_id.to_s]
        expect(stages).to eq(
          'sdr' => Time.zone.parse('2026-10-31 22:00 -03:00').to_i,
          'contrato_assinado' => Time.zone.parse('2026-11-02 10:15 -03:00').to_i,
          'urgente' => Time.zone.parse('2026-11-02 10:15 -03:00').to_i
        )
      end

      it 'fechamentos: com atributo do n8n e com etiqueta de assinatura sem atributo' do
        show(admin, [inbox.id, bpc_inbox.id])
        closings = response.parsed_body['closings']
        expect(closings).to contain_exactly(
          [signed.display_id, inbox.id, 'Ana', 'IA', '2026-11-02', '10:15', 'Comercial'],
          [manual.display_id, bpc_inbox.id, manual.contact.name, nil, nil, nil, nil]
        )
      end

      it 'etiqueta que so CONTEM o nome (pre_contrato_assinado) nao conta como assinatura' do
        lead.update_labels(%w[pre_contrato_assinado])
        show(admin, [inbox.id])
        expect(response.parsed_body['closings'].map(&:first)).not_to include(lead.display_id)
      end

      it 'caixa de outra conta e id invalido sao descartados em silencio' do
        foreign = create(:inbox)
        create(:conversation, account: foreign.account, inbox: foreign)
        show(admin, [foreign.id, 'abc', inbox.id])
        expect(response.parsed_body['rows'].map(&:second).uniq).to eq([inbox.id])
      end

      it 'sem caixa nenhuma: listas vazias, nao "todas as conversas"' do
        show(admin, [])
        body = response.parsed_body
        expect(body['rows']).to eq([])
        expect(body['closings']).to eq([])
        expect(body['generated_at']).to be_a(Integer)
      end

      it 'metas guardadas na conta' do
        account.update!(custom_attributes: { 'dashboard_ia_goals' => { '__todos__' => 60, 'Ruim' => 5 } })
        show(admin, [inbox.id])
        expect(response.parsed_body['goals']).to eq('__todos__' => 60)
      end
    end
  end

  describe 'PATCH /api/v1/accounts/:account_id/dashboard_ia/goals' do
    def save(user, goals)
      patch "#{base_url}/goals", params: { goals: goals }, headers: user.create_new_auth_token, as: :json
    end

    it 'agente: 403 e nada gravado' do
      save(agent, { bpc: 10 })
      expect(response).to have_http_status(:forbidden)
      expect(account.reload.custom_attributes['dashboard_ia_goals']).to be_nil
    end

    it 'grava, mescla com as metas anteriores e preserva os outros atributos da conta' do
      account.update!(custom_attributes: { 'outro' => 'x', 'dashboard_ia_goals' => { '__todos__' => 60 } })
      save(admin, { bpc: 12, auxilio_acidente: '30' })
      expect(response).to have_http_status(:success)
      expected = { '__todos__' => 60, 'bpc' => 12, 'auxilio_acidente' => 30 }
      expect(response.parsed_body['goals']).to eq(expected)
      expect(account.reload.custom_attributes).to eq('outro' => 'x', 'dashboard_ia_goals' => expected)
    end

    it 'descarta chave e valor invalidos' do
      save(admin, { 'Com Espaco' => 5, zero: 0, enorme: 100_001, texto: 'abc', ok: 1 })
      expect(response.parsed_body['goals']).to eq('ok' => 1)
    end

    it 'sem metas no corpo nao quebra' do
      patch "#{base_url}/goals", headers: admin.create_new_auth_token, as: :json
      expect(response).to have_http_status(:success)
      expect(response.parsed_body['goals']).to eq({})
    end
  end
end
