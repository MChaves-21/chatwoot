require 'rails_helper'

# Fork Goncalves & Silva (08/10/2026): o publico da campanha inclui tambem os
# contatos cujas CONVERSAS tem a etiqueta (as etapas do Kanban sao etiquetas
# de conversa, nao de contato).
describe Whatsapp::OneoffCampaignService do
  let(:account) { create(:account) }
  let!(:whatsapp_channel) do
    create(:channel_whatsapp, account: account, provider: 'whatsapp_cloud', validate_provider_config: false, sync_templates: false)
  end
  let(:whatsapp_inbox) { whatsapp_channel.inbox }
  let(:label) { create(:label, account: account, title: 'comercial') }
  let(:campaign) do
    create(:campaign, inbox: whatsapp_inbox, account: account, audience: [{ type: 'Label', id: label.id }],
                      template_params: { 'name' => 't', 'category' => 'UTILITY', 'language' => 'pt_BR',
                                         'processed_params' => { 'body' => {} } })
  end
  let(:service) { described_class.new(campaign: campaign) }

  let!(:by_contact_label) { create(:contact, account: account, phone_number: '+5585999990001') }
  let!(:by_conversation_label) { create(:contact, account: account, phone_number: '+5585999990002') }
  let!(:both) { create(:contact, account: account, phone_number: '+5585999990003') }
  let!(:none) { create(:contact, account: account, phone_number: '+5585999990004') }
  let!(:other_account) { create(:contact, phone_number: '+5585999990005') }

  before do
    by_contact_label.update_labels(['comercial'])
    create(:conversation, account: account, contact: by_conversation_label).update_labels(['comercial'])
    both.update_labels(['comercial'])
    create(:conversation, account: account, contact: both).update_labels(['comercial'])
    create(:conversation, account: account, contact: both).update_labels(%w[comercial sdr])
    create(:conversation, account: account, contact: none).update_labels(['sdr'])
    create(:conversation, account: other_account.account, contact: other_account).update_labels(['comercial'])
  end

  it 'junta contatos com a etiqueta no contato OU em alguma conversa, sem repetir' do
    contacts = service.send(:audience_contacts, ['comercial'])
    expect(contacts.to_a).to contain_exactly(by_contact_label, by_conversation_label, both)
  end

  it 'nunca sai da conta da campanha' do
    expect(service.send(:audience_contacts, ['comercial'])).not_to include(other_account)
  end

  it 'qualquer uma das etiquetas basta' do
    expect(service.send(:audience_contacts, %w[sdr comercial]).to_a)
      .to contain_exactly(by_contact_label, by_conversation_label, both, none)
  end

  it 'sem etiqueta nao manda para ninguem' do
    expect(service.send(:audience_contacts, [])).to be_empty
  end

  it 'conta e percorre a lista sem erro de SQL (count + each, como o process_audience)' do
    contacts = service.send(:audience_contacts, ['comercial'])
    expect(contacts.count).to eq(3)
    expect(contacts.map(&:id)).to match_array([by_contact_label.id, by_conversation_label.id, both.id])
  end

  it 'process_audience chama process_contact uma vez por contato' do
    allow(service).to receive(:process_contact)
    service.send(:process_audience, ['comercial'])
    expect(service).to have_received(:process_contact).exactly(3).times
  end
end
