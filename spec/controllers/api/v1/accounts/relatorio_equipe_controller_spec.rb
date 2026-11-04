require 'rails_helper'

# Relatorio da Equipe (fork Goncalves & Silva).
RSpec.describe 'Relatorio da Equipe API', type: :request do
  let(:account) { create(:account) }
  let(:admin) { create(:user, account: account, role: :administrator, name: 'Admin') }
  let(:agent) { create(:user, account: account, role: :agent, name: 'Karol') }
  let(:base_url) { "/api/v1/accounts/#{account.id}/relatorio_equipe" }
  let(:inbox) { create(:inbox, account: account) }
  let(:conversation) { create(:conversation, account: account, inbox: inbox) }
  let(:period) { { since: '2026-11-03', until: '2026-11-04' } }

  before do
    create(:message, account: account, inbox: inbox, conversation: conversation, message_type: :incoming,
                     content: 'oi', created_at: Time.zone.parse('2026-11-03 09:00 -03:00'))
    create(:message, account: account, inbox: inbox, conversation: conversation, message_type: :outgoing,
                     sender: agent, content: 'ola', created_at: Time.zone.parse('2026-11-03 10:00 -03:00'))
  end

  describe 'GET /relatorio_equipe' do
    it 'sem login: 401' do
      get base_url
      expect(response).to have_http_status(:unauthorized)
    end

    it 'agente: 403 (o relatorio traz texto de cliente)' do
      get base_url, params: period, headers: agent.create_new_auth_token
      expect(response).to have_http_status(:forbidden)
      expect(response.parsed_body['error']).to eq('Apenas administradores acessam o Relatório da Equipe')
    end

    it 'administrador: totais, dias, usuarios da conta e quem conta como IA' do
      account.update!(custom_attributes: { 'relatorio_equipe_ia_users' => [agent.id.to_s] })
      get base_url, params: period, headers: admin.create_new_auth_token
      expect(response).to have_http_status(:success)
      body = response.parsed_body
      expect(body['period']).to eq('since' => '2026-11-03', 'until' => '2026-11-04', 'tz' => 'America/Fortaleza')
      expect(body['totals']['mensagens']).to eq('recebida' => 1, 'humano' => 0, 'ia' => 1, 'sem_autor' => 0)
      expect(body['per_day'].pluck('date')).to eq(%w[2026-11-03 2026-11-04])
      expect(body['users']).to eq([{ 'id' => admin.id, 'name' => 'Admin' }, { 'id' => agent.id, 'name' => 'Karol' }])
      expect(body['ia_user_ids']).to eq([agent.id])
      expect(body['generated_at']).to be_a(Integer)
    end

    it 'usuario de outra conta nao entra na lista' do
      create(:user, name: 'Estranho')
      get base_url, params: period, headers: admin.create_new_auth_token
      expect(response.parsed_body['users'].pluck('name')).not_to include('Estranho')
    end
  end

  describe 'GET /relatorio_equipe/mensagens' do
    it 'agente: 403' do
      get "#{base_url}/mensagens", params: period, headers: agent.create_new_auth_token
      expect(response).to have_http_status(:forbidden)
    end

    it 'administrador baixa o CSV com nome do periodo e cabecalho de truncado' do
      get "#{base_url}/mensagens", params: period, headers: admin.create_new_auth_token
      expect(response).to have_http_status(:success)
      expect(response.media_type).to eq('text/csv')
      expect(response.headers['X-Relatorio-Truncado']).to eq('0')
      expect(response.headers['Content-Disposition']).to include('attachment')
      expect(response.headers['Content-Disposition']).to include('mensagens_2026-11-03_2026-11-04.csv')
      text = response.body.dup.force_encoding('UTF-8')
      expect(text).to start_with("﻿Data/hora;")
      expect(text.lines.size).to eq(3)
    end
  end

  describe 'PATCH /relatorio_equipe/ia_users' do
    it 'agente: 403 e nada gravado' do
      patch "#{base_url}/ia_users", params: { user_ids: [agent.id] }, headers: agent.create_new_auth_token, as: :json
      expect(response).to have_http_status(:forbidden)
      expect(account.reload.custom_attributes['relatorio_equipe_ia_users']).to be_nil
    end

    it 'grava so usuarios da conta, sem repetir, e preserva os outros atributos' do
      account.update!(custom_attributes: { 'dashboard_ia_goals' => { 'bpc' => 1 } })
      stranger = create(:user)
      patch "#{base_url}/ia_users", params: { user_ids: [agent.id, agent.id, stranger.id, 'x'] },
                                    headers: admin.create_new_auth_token, as: :json
      expect(response).to have_http_status(:success)
      expect(response.parsed_body['ia_user_ids']).to eq([agent.id])
      expect(account.reload.custom_attributes).to eq('dashboard_ia_goals' => { 'bpc' => 1 },
                                                     'relatorio_equipe_ia_users' => [agent.id])
    end

    it 'lista vazia desmarca todos' do
      account.update!(custom_attributes: { 'relatorio_equipe_ia_users' => [agent.id] })
      patch "#{base_url}/ia_users", params: { user_ids: [] }, headers: admin.create_new_auth_token, as: :json
      expect(response.parsed_body['ia_user_ids']).to eq([])
    end
  end
end
