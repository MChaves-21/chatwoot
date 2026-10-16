/**
 * Relatorio da Equipe — constantes da tela.
 *
 * As categorias espelham app/services/relatorio_equipe/report.rb. Se mudar
 * la, mude aqui.
 */

export const CATEGORIES = [
  {
    key: 'recebida',
    title: 'Recebidas do cliente',
    short: 'Cliente',
    color: '#94a3b8',
  },
  {
    key: 'humano',
    title: 'Enviadas pela equipe',
    short: 'Equipe',
    color: '#2781F6',
  },
  {
    key: 'ia',
    title: 'Enviadas pela IA',
    short: 'IA',
    color: '#8b5cf6',
  },
  {
    key: 'sem_autor',
    title: 'Sem autor (celular/integração)',
    short: 'Sem autor',
    color: '#f59e0b',
  },
];

export const SENT_KEYS = ['humano', 'ia', 'sem_autor'];

export const PERIODS = [
  { key: 'hoje', title: 'Hoje' },
  { key: '7d', title: '7 dias' },
  { key: '30d', title: '30 dias' },
  { key: 'mes', title: 'Este mês' },
];

export const DEFAULT_PERIOD = '7d';

export const LS_KEY = 'relatorio_equipe_prefs';
