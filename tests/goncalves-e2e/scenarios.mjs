/**
 * Cenarios de dados do E2E. Cada teste chama POST /__fake/reset com o nome do
 * cenario, o papel do usuario e a conta. "Hoje" no servidor falso e
 * 04/11/2026 12:00 em Sao Paulo.
 */
import { createFakeChatwoot } from '../../app/javascript/goncalves-specs/support/fakeChatwoot.js';

// Epoch (segundos) de uma hora de Sao Paulo.
export const sp = (y, m, d, h = 12, min = 0) =>
  Date.UTC(y, m - 1, d, h + 3, min) / 1000;

const NOW = sp(2026, 11, 4, 12);

function base(fake) {
  fake.state.labels = [
    { id: 1, title: 'sdr', color: '#3b82f6' },
    { id: 2, title: 'comercial', color: '#8b5cf6' },
    { id: 3, title: 'urgente', color: '#dc2626' },
  ];
}

const SCENARIOS = {
  vazio: () => {},

  /** Quadro do Auxilio (caixa 6), BPC (15), 0300 (11) e Trabalhista (10). */
  kanban: fake => {
    base(fake);
    fake.addConversation({ id: 101, inboxId: 6, labels: ['sdr'], name: 'Ana Ercília', phone: '+5585995270001', lastActivityAt: NOW - 100 });
    fake.addConversation({ id: 102, inboxId: 6, labels: ['sdr', 'urgente'], name: 'Bruno Lima', phone: '+5585995270002', lastActivityAt: NOW - 200, unread: 2 });
    fake.addConversation({ id: 103, inboxId: 6, labels: ['comercial'], name: 'Carla Souza', phone: '+5585995270003', lastActivityAt: NOW - 300 });
    fake.addConversation({ id: 104, inboxId: 6, labels: ['sdr', 'desqualificado'], name: 'Davi Rocha', phone: '+5585995270004' });
    fake.addConversation({ id: 105, inboxId: 6, labels: ['urgente'], name: 'Elisa Prado', phone: '+5585995270005' });
    fake.addConversation({ id: 106, inboxId: 6, labels: ['contrato_assinado'], name: 'Fabio Reis', phone: '+5585995270006' });
    // Outra caixa com etiqueta do Auxilio: nao pode aparecer no quadro da 6.
    fake.addConversation({ id: 201, inboxId: 15, labels: ['sdr'], name: 'Gil BPC', phone: '+5585995270007' });
    fake.addConversation({ id: 202, inboxId: 15, labels: ['bpc_lead_novo'], name: 'Helena BPC', phone: '+5585995270008' });
    // 0300: trafego x importados.
    fake.addConversation({ id: 301, inboxId: 11, labels: ['sdr'], name: 'Igor Trafego', phone: '+5585995270009' });
    fake.addConversation({ id: 302, inboxId: 11, labels: ['sdr', 'origem_lawchat'], name: 'Joana Importada', phone: '+5585995270010' });
    fake.addConversation({ id: 303, inboxId: 11, labels: ['importado'], name: 'Kleber Importado', phone: '+5585995270011' });
    // Trabalhista.
    fake.addConversation({ id: 401, inboxId: 10, labels: ['trab_objecao'], name: 'Lia Trab', phone: '+5585995270012' });
  },

  /** Muitos cards numa coluna, para paginacao ("Ver mais"). */
  kanbanVolume: fake => {
    base(fake);
    for (let i = 0; i < 60; i += 1) {
      fake.addConversation({ inboxId: 6, labels: ['comercial'], name: `Lead ${i + 1}`, lastActivityAt: NOW - i });
    }
  },

  /** Conta 3 (Ferreira & Paiva), caixa 16. */
  parceira: fake => {
    fake.addConversation({ id: 501, inboxId: 16, labels: ['sdr'], name: 'Lead FP', phone: '+5581999990001' });
    fake.addConversation({ id: 502, inboxId: 16, labels: ['contrato_assinado'], name: 'Assinou FP', phone: '+5581999990002', createdAt: sp(2026, 11, 2), history: { contrato_assinado: sp(2026, 11, 3, 10) } });
    // Conversa da G&S que NAO pode vazar (outra caixa).
    fake.addConversation({ id: 503, inboxId: 6, labels: ['sdr'], name: 'Lead GS' });
  },

  /** Base do Dashboard IA: numeros conferiveis a mao. */
  dashboard: fake => {
    base(fake);
    fake.addConversation({
      id: 1, inboxId: 6, labels: ['contrato_assinado'], name: 'Ana', phone: '+5585999990001',
      createdAt: sp(2026, 10, 31, 22), assignee: { id: 2, name: 'Karol' },
      history: { sdr: sp(2026, 10, 31, 22), comercial: sp(2026, 11, 1, 9), contrato_assinado: sp(2026, 11, 2, 10) },
      customAttributes: { fechado_por: 'IA', assinado_em: '2026-11-02', assinado_hora: '10:15' },
    });
    fake.addConversation({
      id: 2, inboxId: 6, labels: ['comercial'], name: 'Bia', phone: '+5511999990002',
      createdAt: sp(2026, 11, 3, 9), history: { sdr: sp(2026, 11, 3, 9), comercial: sp(2026, 11, 3, 15) },
    });
    fake.addConversation({ id: 3, inboxId: 6, labels: ['sdr'], name: 'Caio', phone: '+5585999990003', createdAt: sp(2026, 11, 4, 10) });
    fake.addConversation({ id: 4, inboxId: 6, labels: ['desqualificado'], name: 'Duda', phone: '+5585999990004', createdAt: sp(2026, 11, 4, 11) });
    fake.addConversation({ id: 5, inboxId: 6, labels: ['sdr', 'importado'], name: 'Edu', createdAt: sp(2026, 11, 4, 10) });
    fake.addConversation({
      id: 6, inboxId: 15, labels: ['bpc_contrato_assinado'], name: 'Fabi', phone: '+5585999990006',
      createdAt: sp(2026, 10, 20, 10), history: { bpc_contrato_assinado: sp(2026, 11, 4, 8) },
      customAttributes: { fechado_por: 'Equipe', assinado_em: '2026-11-04', assinado_hora: '08:30' },
    });
  },

  /** Relatorio da Equipe: mensagens de cliente, equipe e "IA" (usuario 3). */
  relatorio: fake => {
    base(fake);
    const c1 = fake.addConversation({ id: 1, inboxId: 6, labels: ['sdr'], name: 'Ana' });
    const c2 = fake.addConversation({ id: 2, inboxId: 6, labels: ['comercial'], name: 'Bia' });
    fake.addMessage(c1.id, { content: 'oi', message_type: 0, created_at: sp(2026, 11, 3, 9) });
    fake.addMessage(c1.id, { content: 'ola', message_type: 1, created_at: sp(2026, 11, 3, 10), sender: { id: 2, type: 'User' } });
    fake.addMessage(c2.id, { content: 'bom dia', message_type: 0, created_at: sp(2026, 11, 4, 9) });
    fake.addMessage(c2.id, { content: 'resposta automatica', message_type: 1, created_at: sp(2026, 11, 4, 9, 1), sender: { id: 3, type: 'User' } });
    fake.addMessage(c2.id, { content: 'outra', message_type: 1, created_at: sp(2026, 11, 4, 9, 2), sender: { id: 3, type: 'User' } });
  },
};

export function buildFake({ scenario = 'vazio', role = 'administrator', accountId = 1 } = {}) {
  const fake = createFakeChatwoot({ role, accountId, now: NOW });
  const seed = SCENARIOS[scenario];
  if (!seed) throw new Error(`cenario desconhecido: ${scenario}`);
  seed(fake);
  return fake;
}
