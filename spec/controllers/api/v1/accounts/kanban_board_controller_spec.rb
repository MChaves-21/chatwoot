require 'rails_helper'

RSpec.describe 'Kanban board API', type: :request do
  let(:account) { create(:account) }
  let(:inbox) { create(:inbox, account: account) }
  let(:admin) { create(:user, account: account, role: :administrator) }
  let(:agent) { create(:user, account: account, role: :agent) }
  let(:url) { "/api/v1/accounts/#{account.id}/kanban_board" }

  describe 'GET /api/v1/accounts/{account.id}/kanban_board' do
    it 'returns unauthorized without a session' do
      get url, params: { inbox_id: inbox.id, labels: ['sdr'] }

      expect(response).to have_http_status(:unauthorized)
    end

    it 'returns not found for an agent outside the inbox' do
      get url, params: { inbox_id: inbox.id, labels: ['sdr'] }, headers: agent.create_new_auth_token

      expect(response).to have_http_status(:not_found)
    end

    it 'returns not found for an inbox of another account' do
      other_inbox = create(:inbox, account: create(:account))

      get url, params: { inbox_id: other_inbox.id, labels: ['sdr'] }, headers: admin.create_new_auth_token

      expect(response).to have_http_status(:not_found)
    end

    it 'returns the first page and the total of each column, newest activity first' do
      older = create(:conversation, account: account, inbox: inbox, last_activity_at: 2.hours.ago)
      older.update_labels(['sdr'])
      newer = create(:conversation, account: account, inbox: inbox, last_activity_at: 1.hour.ago)
      newer.update_labels(['sdr'])
      commercial = create(:conversation, account: account, inbox: inbox)
      commercial.update_labels(['comercial'])

      get url, params: { inbox_id: inbox.id, labels: %w[sdr comercial], status: 'all' }, headers: admin.create_new_auth_token

      expect(response).to have_http_status(:success)
      columns = response.parsed_body['columns']
      expect(columns['sdr']['total']).to eq(2)
      expect(columns['sdr']['payload'].pluck('id')).to eq([newer.display_id, older.display_id])
      expect(columns['comercial']['payload'].first).to include(
        'id' => commercial.display_id,
        'labels' => ['comercial'],
        'meta' => hash_including('sender' => hash_including('phone_number' => commercial.contact.phone_number))
      )
    end

    it 'puts conversations without a stage label in the unstaged column and honours exclude_labels' do
      unstaged = create(:conversation, account: account, inbox: inbox)
      imported = create(:conversation, account: account, inbox: inbox)
      imported.update_labels(%w[sdr importado])
      kept = create(:conversation, account: account, inbox: inbox)
      kept.update_labels(['sdr'])

      get url, params: { inbox_id: inbox.id, labels: ['sdr'], exclude_labels: ['importado'], unstaged: '1', status: 'all' },
               headers: admin.create_new_auth_token

      body = response.parsed_body
      expect(body['columns']['sdr']['payload'].pluck('id')).to eq([kept.display_id])
      expect(body['columns'][body['unstaged_key']]['payload'].pluck('id')).to eq([unstaged.display_id])
    end

    it 'filters by status like the conversation list' do
      open_conversation = create(:conversation, account: account, inbox: inbox, status: :open)
      open_conversation.update_labels(['sdr'])
      create(:conversation, account: account, inbox: inbox, status: :resolved).update_labels(['sdr'])

      get url, params: { inbox_id: inbox.id, labels: ['sdr'], status: 'open' }, headers: admin.create_new_auth_token

      expect(response.parsed_body['columns']['sdr']['payload'].pluck('id')).to eq([open_conversation.display_id])
    end

    it 'counts unread incoming messages since an agent last saw the conversation' do
      conversation = create(:conversation, account: account, inbox: inbox, agent_last_seen_at: 1.hour.ago)
      conversation.update_labels(['sdr'])
      create_list(:message, 2, account: account, inbox: inbox, conversation: conversation, message_type: :incoming)
      create(:message, account: account, inbox: inbox, conversation: conversation, message_type: :outgoing)

      get url, params: { inbox_id: inbox.id, labels: ['sdr'], status: 'all' }, headers: admin.create_new_auth_token

      expect(response.parsed_body['columns']['sdr']['payload'].first['unread_count']).to eq(2)
    end

    it 'lets an agent read an inbox they belong to' do
      create(:inbox_member, user: agent, inbox: inbox)
      create(:conversation, account: account, inbox: inbox).update_labels(['sdr'])

      get url, params: { inbox_id: inbox.id, labels: ['sdr'], status: 'all' }, headers: agent.create_new_auth_token

      expect(response).to have_http_status(:success)
      expect(response.parsed_body['columns']['sdr']['total']).to eq(1)
    end
  end

  describe 'GET /api/v1/accounts/{account.id}/kanban_board/day' do
    let(:day_url) { "#{url}/day" }
    let(:zone) { ActiveSupport::TimeZone['America/Sao_Paulo'] }
    let(:today) { zone.today }

    it 'returns not found for an agent outside the inbox' do
      get day_url, params: { inbox_id: inbox.id, labels: ['sdr'], date: today.iso8601 }, headers: agent.create_new_auth_token

      expect(response).to have_http_status(:not_found)
    end

    it 'rejects an invalid date' do
      get day_url, params: { inbox_id: inbox.id, labels: ['sdr'], date: 'ontem' }, headers: admin.create_new_auth_token

      expect(response).to have_http_status(:unprocessable_entity)
    end

    it 'returns only the board conversations created on the day, newest first' do
      noon = zone.local(today.year, today.month, today.day, 12)
      morning = create(:conversation, account: account, inbox: inbox, created_at: noon - 2.hours)
      morning.update_labels(['sdr'])
      afternoon = create(:conversation, account: account, inbox: inbox, created_at: noon + 2.hours)
      afternoon.update_labels(['comercial'])
      create(:conversation, account: account, inbox: inbox, created_at: noon - 1.day).update_labels(['sdr'])
      create(:conversation, account: account, inbox: inbox, created_at: noon).update_labels(%w[sdr importado])
      create(:conversation, account: account, inbox: inbox, created_at: noon)

      get day_url, params: { inbox_id: inbox.id, labels: %w[sdr comercial], exclude_labels: ['importado'], status: 'all',
                             mode: 'created', date: today.iso8601 },
                   headers: admin.create_new_auth_token

      expect(response).to have_http_status(:success)
      body = response.parsed_body
      expect(body['payload'].pluck('id')).to eq([afternoon.display_id, morning.display_id])
      expect(body['total']).to eq(2)
      expect(body['truncated']).to be(false)
    end

    it 'includes conversations without a stage when the board has the unstaged column' do
      noon = zone.local(today.year, today.month, today.day, 12)
      unstaged = create(:conversation, account: account, inbox: inbox, created_at: noon)
      create(:conversation, account: account, inbox: inbox, created_at: noon).update_labels(['importado'])

      get day_url, params: { inbox_id: inbox.id, labels: ['sdr'], exclude_labels: ['importado'], unstaged: '1', status: 'all',
                             date: today.iso8601 },
                   headers: admin.create_new_auth_token

      expect(response.parsed_body['payload'].pluck('id')).to eq([unstaged.display_id])
    end

    it 'uses the last activity in updated mode' do
      noon = zone.local(today.year, today.month, today.day, 12)
      old_but_active = create(:conversation, account: account, inbox: inbox, created_at: noon - 30.days, last_activity_at: noon)
      old_but_active.update_labels(['sdr'])
      create(:conversation, account: account, inbox: inbox, created_at: noon, last_activity_at: noon - 2.days).update_labels(['sdr'])

      get day_url, params: { inbox_id: inbox.id, labels: ['sdr'], status: 'all', mode: 'updated', date: today.iso8601 },
                   headers: admin.create_new_auth_token

      expect(response.parsed_body['payload'].pluck('id')).to eq([old_but_active.display_id])
    end
  end

  describe 'GET /api/v1/accounts/{account.id}/kanban_board/cards' do
    let(:cards_url) { "#{url}/cards" }

    it 'returns not found for an agent outside the inbox' do
      get cards_url, params: { inbox_id: inbox.id, labels: ['sdr'] }, headers: agent.create_new_auth_token

      expect(response).to have_http_status(:not_found)
    end

    it 'returns every card of the board beyond one page, without the excluded labels' do
      create_list(:conversation, 27, account: account, inbox: inbox).each { |c| c.update_labels(['sdr']) }
      create(:conversation, account: account, inbox: inbox).update_labels(%w[sdr importado])
      unstaged = create(:conversation, account: account, inbox: inbox)

      get cards_url, params: { inbox_id: inbox.id, labels: ['sdr'], exclude_labels: ['importado'], unstaged: '1', status: 'all' },
                     headers: admin.create_new_auth_token

      body = response.parsed_body
      expect(body['payload'].size).to eq(28)
      expect(body['payload'].pluck('id')).to include(unstaged.display_id)
      expect(body['truncated']).to be(false)
    end

    it 'flags a board larger than the export limit' do
      stub_const('Api::V1::Accounts::KanbanBoardController::MAX_EXPORT_ROWS', 1)
      create_list(:conversation, 2, account: account, inbox: inbox).each { |c| c.update_labels(['sdr']) }

      get cards_url, params: { inbox_id: inbox.id, labels: ['sdr'], status: 'all' }, headers: admin.create_new_auth_token

      expect(response.parsed_body).to include('total' => 2, 'truncated' => true)
      expect(response.parsed_body['payload'].size).to eq(1)
    end
  end
end
