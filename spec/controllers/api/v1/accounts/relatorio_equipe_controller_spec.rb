require 'rails_helper'

RSpec.describe 'Relatorio da Equipe API', type: :request do
  let(:account) { create(:account) }
  let(:inbox) { create(:inbox, account: account) }
  let(:admin) { create(:user, account: account, role: :administrator) }
  let(:agent) { create(:user, account: account, role: :agent) }
  let(:url) { "/api/v1/accounts/#{account.id}/relatorio_equipe" }

  describe 'GET /api/v1/accounts/{account.id}/relatorio_equipe' do
    it 'returns unauthorized without a session' do
      get url

      expect(response).to have_http_status(:unauthorized)
    end

    it 'is forbidden for agents' do
      get url, headers: agent.create_new_auth_token

      expect(response).to have_http_status(:forbidden)
    end

    it 'counts client and team messages of the period' do
      conversation = create(:conversation, account: account, inbox: inbox)
      create(:message, account: account, inbox: inbox, conversation: conversation, message_type: :incoming)
      create(:message, account: account, inbox: inbox, conversation: conversation, message_type: :outgoing, sender: admin)

      get url, params: { inbox_ids: [inbox.id] }, headers: admin.create_new_auth_token

      expect(response).to have_http_status(:success)
      totals = response.parsed_body['totals']['mensagens']
      expect(totals['recebida']).to eq(1)
      expect(totals['humano']).to eq(1)
    end
  end

  describe 'GET /api/v1/accounts/{account.id}/relatorio_equipe/mensagens' do
    it 'is forbidden for agents' do
      get "#{url}/mensagens", headers: agent.create_new_auth_token

      expect(response).to have_http_status(:forbidden)
    end

    it 'returns a CSV that cannot start a spreadsheet formula' do
      conversation = create(:conversation, account: account, inbox: inbox)
      create(:message, account: account, inbox: inbox, conversation: conversation, message_type: :incoming, content: '=HYPERLINK("x")')

      get "#{url}/mensagens", params: { inbox_ids: [inbox.id] }, headers: admin.create_new_auth_token

      expect(response).to have_http_status(:success)
      expect(response.headers['X-Relatorio-Truncado']).to eq('0')
      expect(response.body).to include("'=HYPERLINK")
    end

    it 'identifies the conversation by its display id' do
      other_account = create(:account)
      create_list(:conversation, 2, account: other_account)
      conversation = create(:conversation, account: account, inbox: inbox)
      create(:message, account: account, inbox: inbox, conversation: conversation, message_type: :incoming, content: 'oi')
      expect(conversation.id).not_to eq(conversation.display_id)

      get "#{url}/mensagens", params: { inbox_ids: [inbox.id] }, headers: admin.create_new_auth_token

      expect(response.body.lines.second.split(';')[2]).to eq(conversation.display_id.to_s)
    end

    it 'sends every message across batches, oldest first' do
      stub_const('RelatorioEquipe::Report::CSV_BATCH', 1)
      conversation = create(:conversation, account: account, inbox: inbox)
      %w[primeira segunda terceira].each_with_index do |text, index|
        create(:message, account: account, inbox: inbox, conversation: conversation, message_type: :incoming,
                         content: text, created_at: (3 - index).minutes.ago)
      end

      get "#{url}/mensagens", params: { inbox_ids: [inbox.id] }, headers: admin.create_new_auth_token

      body = response.body
      expect(body.index('primeira')).to be < body.index('segunda')
      expect(body.index('segunda')).to be < body.index('terceira')
      expect(response.headers['X-Relatorio-Truncado']).to eq('0')
    end

    it 'flags the export as truncated only when it passes the limit' do
      stub_const('RelatorioEquipe::Report::CSV_LIMIT', 2)
      conversation = create(:conversation, account: account, inbox: inbox)
      create_list(:message, 3, account: account, inbox: inbox, conversation: conversation, message_type: :incoming)

      get "#{url}/mensagens", params: { inbox_ids: [inbox.id] }, headers: admin.create_new_auth_token

      expect(response.headers['X-Relatorio-Truncado']).to eq('1')
      expect(response.body.lines.size).to eq(3)
    end
  end

  describe 'PATCH /api/v1/accounts/{account.id}/relatorio_equipe/ia_users' do
    it 'keeps only users of the account' do
      outsider = create(:user)

      patch "#{url}/ia_users", params: { user_ids: [admin.id, outsider.id] }, headers: admin.create_new_auth_token, as: :json

      expect(response.parsed_body['ia_user_ids']).to eq([admin.id])
    end
  end
end
