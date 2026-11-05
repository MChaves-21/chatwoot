require 'rails_helper'

RSpec.describe 'Dashboard IA API', type: :request do
  let(:account) { create(:account) }
  let(:inbox) { create(:inbox, account: account) }
  let(:admin) { create(:user, account: account, role: :administrator) }
  let(:agent) { create(:user, account: account, role: :agent) }
  let(:url) { "/api/v1/accounts/#{account.id}/dashboard_ia" }

  describe 'GET /api/v1/accounts/{account.id}/dashboard_ia' do
    it 'returns unauthorized without a session' do
      get url, params: { inbox_ids: [inbox.id] }

      expect(response).to have_http_status(:unauthorized)
    end

    it 'is forbidden for agents' do
      get url, params: { inbox_ids: [inbox.id] }, headers: agent.create_new_auth_token

      expect(response).to have_http_status(:forbidden)
    end

    it 'returns one row per conversation of the asked inboxes, by display id' do
      conversation = create(:conversation, account: account, inbox: inbox)
      conversation.update_labels(['sdr'])

      get url, params: { inbox_ids: [inbox.id] }, headers: admin.create_new_auth_token

      expect(response).to have_http_status(:success)
      row = response.parsed_body['rows'].first
      expect(row[0]).to eq(conversation.display_id)
      expect(row[1]).to eq(inbox.id)
      expect(row[2]).to eq(['sdr'])
    end

    it 'ignores inboxes of another account' do
      other_inbox = create(:inbox, account: create(:account))
      create(:conversation, account: other_inbox.account, inbox: other_inbox)

      get url, params: { inbox_ids: [other_inbox.id] }, headers: admin.create_new_auth_token

      expect(response.parsed_body['rows']).to eq([])
    end
  end

  describe 'PATCH /api/v1/accounts/{account.id}/dashboard_ia/goals' do
    it 'is forbidden for agents' do
      patch "#{url}/goals", params: { goals: { comercial: 10 } }, headers: agent.create_new_auth_token, as: :json

      expect(response).to have_http_status(:forbidden)
    end

    it 'keeps only valid goals and returns them with the next snapshot' do
      patch "#{url}/goals", params: { goals: { comercial: 10, 'Ruim!': 5, sdr: -1 } }, headers: admin.create_new_auth_token, as: :json

      expect(response.parsed_body['goals']).to eq('comercial' => 10)

      get url, params: { inbox_ids: [inbox.id] }, headers: admin.create_new_auth_token
      expect(response.parsed_body['goals']).to eq('comercial' => 10)
    end
  end
end
