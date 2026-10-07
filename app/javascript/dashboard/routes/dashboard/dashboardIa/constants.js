/**
 * Dashboard IA — constantes.
 *
 * O painel NAO tem base propria: le as mesmas conversas e as mesmas etiquetas
 * de etapa do Kanban. Por isso os funis saem de kanban/constants.js em vez de
 * serem redigitados aqui — coluna nova no Kanban aparece no painel sozinha.
 *
 * O que este arquivo acrescenta e a LEITURA comercial de cada funil, que o
 * Kanban nao precisa: qual e o caminho feliz, a partir de onde o lead conta
 * como qualificado e a partir de onde conta como contrato assinado.
 */

import { FUNNELS, UNSTAGED_LABEL } from '../kanban/constants';
import { CLOSED_LABELS } from '../kanban/stateConstants';

/**
 * Leitura comercial por funil.
 *
 * `path`          etapas do caminho feliz, em ordem. So elas entram no funil.
 * `qualifiedFrom` primeira etapa em que o lead ja passou da triagem.
 * `signedFrom`    primeira etapa em que o contrato ja esta assinado. `null`
 *                 quando o funil nao tem essa etapa (Trabalhista para em
 *                 "Contrato enviado") — o painel mostra zero e avisa.
 *
 * Etapa do Kanban que nao esta em `path` nem em CLOSED_LABELS (ex.:
 * aguardando_tempo, bpc_finalizado) e tratada como "em espera": conta no
 * total e na tabela por etapa, mas fica fora do funil.
 */
export const FUNNEL_READING = {
  auxilio_acidente: {
    path: [
      'sdr',
      'comercial',
      'contrato_em_elaboracao',
      'aguardando_assinatura',
      'contrato_assinado',
      'analise_medica',
      'analise_juridica',
      'efetivado',
    ],
    qualifiedFrom: 'comercial',
    signedFrom: 'contrato_assinado',
  },
  bpc: {
    path: [
      UNSTAGED_LABEL,
      'bpc_lead_novo',
      'bpc_lead_novo_especial',
      'bpc_aguardando_requisito',
      'bpc_qualificado',
      'bpc_documentos_iniciais',
      'bpc_aguardando_assinatura',
      'bpc_contrato_assinado',
      'bpc_pegar_senha',
      'bpc_analise_medica',
      'bpc_analise_juridica',
      'bpc_pos_juridica',
      'bpc_efetivado',
    ],
    qualifiedFrom: 'bpc_qualificado',
    signedFrom: 'bpc_contrato_assinado',
  },
  trabalhista: {
    path: [
      'trab_apresentacao',
      'trab_qualificacao',
      'trab_coleta_info',
      'trab_explicacao_processo',
      'trab_condicoes_financeiras',
      'trab_objecao',
      'trab_fechamento',
      'trab_coleta_contrato',
      'trab_contrato_enviado',
    ],
    qualifiedFrom: 'trab_coleta_info',
    signedFrom: null,
  },
};

/** Funis de etiqueta do Kanban que o painel sabe ler (o "Por estado" fica fora). */
export const DASH_FUNNELS = FUNNELS.filter(
  f => f.mode !== 'state' && FUNNEL_READING[f.id]
).map(f => ({
  id: f.id,
  title: f.title,
  inboxId: f.inboxId,
  columns: f.columns,
  ...FUNNEL_READING[f.id],
}));

export const ALL_FUNNELS_ID = '__todos__';

export const LOST_LABELS = CLOSED_LABELS;

/**
 * Etiqueta de contrato assinado de cada funil: e a que o painel procura no
 * historico da conversa para descobrir QUANDO o contrato foi assinado.
 */
export const SIGNED_LABELS = DASH_FUNNELS.map(f => f.signedFrom).filter(Boolean);

export const PERIODS = [
  { key: 'hoje', title: 'Hoje' },
  { key: 'ontem', title: 'Ontem' },
  { key: '7d', title: '7 dias' },
  { key: '30d', title: '30 dias' },
  { key: 'mes', title: 'Este mês' },
  { key: 'tudo', title: 'Todo período' },
];

export const DEFAULT_PERIOD = 'tudo';

/** Qual data da conversa o filtro de periodo olha. */
export const DATE_MODES = [
  { key: 'criacao', title: 'Criação' },
  { key: 'atualizacao', title: 'Atualização' },
];

export const CHAT_RANGES = [
  { key: 7, title: '7 dias' },
  { key: 30, title: '30 dias' },
  { key: 90, title: '90 dias' },
];

/**
 * Meta mensal de contratos assinados do escritorio (todos os funis). Quem
 * quiser outra meta troca na propria tela; o valor fica so naquele navegador.
 */
export const DEFAULT_MONTHLY_GOAL = 60;

export const LS_KEY = 'cw_dashboard_ia_v1';

/** Varredura das caixas: quantas paginas ao mesmo tempo (ver COLUMN_CONCURRENCY do Kanban). */
export const SCAN_CONCURRENCY = 3;

/** Teto de paginas por caixa: 400 x 25 = 10.000 conversas. */
export const MAX_PAGES_PER_INBOX = 400;

/** Historico da conversa: quantas paginas de 20 mensagens voltar atras da assinatura. */
export const MAX_HISTORY_PAGES = 15;

/** Faixas do tempo ate o fechamento, em dias. `max` e exclusivo. */
export const CLOSING_BUCKETS = [
  { key: 'd1', title: 'Até 24h', max: 1 },
  { key: 'd2', title: '1 a 2 dias', max: 3 },
  { key: 'd5', title: '3 a 5 dias', max: 6 },
  { key: 'd10', title: '6 a 10 dias', max: 11 },
  { key: 'mais', title: 'Acima de 10 dias', max: Infinity },
];

export const DAY_PARTS = [
  { key: 'manha', title: 'Manhã', from: 6, to: 12 },
  { key: 'tarde', title: 'Tarde', from: 12, to: 18 },
  { key: 'noite', title: 'Noite', from: 18, to: 24 },
  { key: 'madrugada', title: 'Madrugada', from: 0, to: 6 },
];

/** DDD -> UF. O estado do lead sai do telefone, nao de cadastro. */
export const DDD_UF = {
  11: 'SP', 12: 'SP', 13: 'SP', 14: 'SP', 15: 'SP', 16: 'SP', 17: 'SP',
  18: 'SP', 19: 'SP', 21: 'RJ', 22: 'RJ', 24: 'RJ', 27: 'ES', 28: 'ES',
  31: 'MG', 32: 'MG', 33: 'MG', 34: 'MG', 35: 'MG', 37: 'MG', 38: 'MG',
  41: 'PR', 42: 'PR', 43: 'PR', 44: 'PR', 45: 'PR', 46: 'PR', 47: 'SC',
  48: 'SC', 49: 'SC', 51: 'RS', 53: 'RS', 54: 'RS', 55: 'RS', 61: 'DF',
  62: 'GO', 64: 'GO', 63: 'TO', 65: 'MT', 66: 'MT', 67: 'MS', 68: 'AC',
  69: 'RO', 71: 'BA', 73: 'BA', 74: 'BA', 75: 'BA', 77: 'BA', 79: 'SE',
  81: 'PE', 87: 'PE', 82: 'AL', 83: 'PB', 84: 'RN', 85: 'CE', 88: 'CE',
  86: 'PI', 89: 'PI', 91: 'PA', 93: 'PA', 94: 'PA', 92: 'AM', 97: 'AM',
  95: 'RR', 96: 'AP', 98: 'MA', 99: 'MA',
};

/**
 * Cores de destaque do painel. Fixas (hex) de proposito: sao as mesmas no
 * tema claro e no escuro e combinam com as cores das colunas do Kanban.
 * Texto e fundo continuam nos tokens do Chatwoot (n-slate, n-solid).
 */
export const COLORS = {
  green: '#22c55e',
  greenDark: '#16a34a',
  blue: '#3b82f6',
  purple: '#8b5cf6',
  cyan: '#06b6d4',
  amber: '#f59e0b',
  orange: '#f97316',
  red: '#ef4444',
  indigo: '#6366f1',
  slate: '#94a3b8',
};

/** Verde do mais escuro ao mais claro: faixas do tempo ate o fechamento. */
export const GREEN_RAMP = ['#15803d', '#16a34a', '#22c55e', '#4ade80', '#bbf7d0'];
