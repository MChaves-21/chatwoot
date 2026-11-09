require 'rails_helper'

RSpec.describe 'n8n ticket API', type: :request do
  let(:account) { create(:account) }
  let(:agent) { create(:user, account: account, role: :agent) }
  let(:url) { "/api/v1/accounts/#{account.id}/n8n_ticket" }

  describe 'GET /api/v1/accounts/{account.id}/n8n_ticket' do
    it 'returns unauthorized without a session' do
      get url

      expect(response).to have_http_status(:unauthorized)
    end

    it 'returns service unavailable when the secret is not configured' do
      with_modified_env N8N_TICKET_SECRET: '' do
        get url, headers: agent.create_new_auth_token

        expect(response).to have_http_status(:service_unavailable)
      end
    end

    it 'returns a short-lived ticket signed with the shared secret' do
      with_modified_env N8N_TICKET_SECRET: 'segredo-de-teste' do
        get url, headers: agent.create_new_auth_token

        expect(response).to have_http_status(:success)
        payload, signature = response.parsed_body['ticket'].split('.')
        expect(signature).to eq(OpenSSL::HMAC.hexdigest('SHA256', 'segredo-de-teste', payload))

        data = JSON.parse(Base64.urlsafe_decode64(payload))
        expect(data).to include('u' => agent.id, 'a' => account.id, 'r' => 'agent')
        expect(data['e']).to eq(response.parsed_body['expires_at'])
        expect(data['e']).to be_between(4.minutes.from_now.to_i, 6.minutes.from_now.to_i)
      end
    end
  end

  describe 'purpose' do
    let(:ticket_url) { "/api/v1/accounts/#{account.id}/n8n_ticket" }

    def claims_of(body)
      JSON.parse(Base64.urlsafe_decode64(body['ticket'].split('.').first))
    end

    it 'signs an allowed purpose into the ticket and is never cached' do
      with_modified_env N8N_TICKET_SECRET: 'segredo-de-teste' do
        get ticket_url, params: { purpose: 'kanban_lead' }, headers: agent.create_new_auth_token

        expect(claims_of(response.parsed_body)['p']).to eq('kanban_lead')
        expect(response.headers['Cache-Control']).to include('no-store')
      end
    end

    it 'leaves an unknown purpose out of the ticket' do
      with_modified_env N8N_TICKET_SECRET: 'segredo-de-teste' do
        get ticket_url, params: { purpose: 'qualquer_coisa' }, headers: agent.create_new_auth_token

        expect(claims_of(response.parsed_body)).not_to have_key('p')
      end
    end
  end
end
