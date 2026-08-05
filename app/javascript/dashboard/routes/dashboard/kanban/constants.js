/**
 * Kanban Comercial — constantes.
 *
 * Portado de kanban-comercial.vercel.app/index.html.
 * Base, account, token, proxy e segredo do proxy sairam: dentro do Chatwoot
 * a sessao do agente ja responde por tudo isso.
 */

export const DEFAULT_COLUMNS = [
  { title: 'SDR', label: 'sdr', color: '#3b82f6' },
  { title: 'Comercial', label: 'comercial', color: '#8b5cf6' },
  {
    title: 'Contrato em Elaboracao',
    label: 'contrato_em_elaboracao',
    color: '#0ea5e9',
  },
  {
    title: 'Aguardando Assinatura',
    label: 'aguardando_assinatura',
    color: '#f59e0b',
  },
  { title: 'Contrato Assinado', label: 'contrato_assinado', color: '#22c55e' },
  { title: 'Analise medica', label: 'analise_medica', color: '#14b8a6' },
  { title: 'Analise juridica', label: 'analise_juridica', color: '#a855f7' },
  { title: 'Efetivado', label: 'efetivado', color: '#16a34a' },
  { title: 'Desqualificado', label: 'desqualificado', color: '#ef4444' },
  { title: 'Descarte (SDR)', label: 'descarte_sdr', color: '#64748b' },
  { title: 'Aguardando tempo', label: 'aguardando_tempo', color: '#eab308' },
];

export const DEFAULT_TAGS = [
  { title: 'Recebendo beneficio', label: 'recebendo_beneficio', color: '#22c55e' },
  { title: 'Ja tem advogado', label: 'ja_tem_advogado', color: '#ef4444' },
  { title: 'Sem advogado', label: 'sem_advogado', color: '#3b82f6' },
  { title: 'Acidente de trabalho', label: 'acidente_trabalho', color: '#f59e0b' },
  { title: 'Tem laudo medico', label: 'tem_laudo_medico', color: '#14b8a6' },
  { title: 'Auxilio negado', label: 'auxilio_negado', color: '#a855f7' },
  { title: 'Pericia agendada', label: 'pericia_agendada', color: '#0ea5e9' },
  { title: 'Contribuinte INSS', label: 'contribuinte_inss', color: '#8b5cf6' },
  {
    title: 'Documentos pendentes',
    label: 'documentos_pendentes',
    color: '#eab308',
  },
  { title: 'Urgente', label: 'urgente', color: '#dc2626' },
];

export const STAGE_EMOJI = {
  sdr: '📞',
  comercial: '💼',
  contrato_em_elaboracao: '📝',
  aguardando_assinatura: '✍️',
  contrato_assinado: '✅',
  analise_medica: '🩺',
  analise_juridica: '⚖️',
  efetivado: '🎉',
  desqualificado: '❌',
  descarte_sdr: '🗑️',
  aguardando_tempo: '⏳',
};

/** Etiqueta que o quadro acrescenta ao mover um card na mao. */
export const MANUAL_LABEL = 'manual';

/** Teto de paginas por coluna em "carregar tudo", para nao inundar a API. */
export const MAX_PAGES_PER_COLUMN = 200;

/**
 * Preferencias locais. Guarda SO colunas, tags e os dois webhooks do n8n que
 * continuam externos (lead e resumo). Chave nova de proposito: a antiga
 * (cw_kanban_config_v3) guardava o segredo do proxy e deve ser descartada.
 */
export const LS_KEY = 'cw_kanban_prefs_v4';

export const DEFAULT_PREFS = {
  columns: DEFAULT_COLUMNS,
  tags: DEFAULT_TAGS,
  status: 'all',
  // Webhooks n8n que NAO passam pela API do Chatwoot.
  leadUrl: '',
  summaryUrl: '',
  secret: '',
};

export const STATUS_LABELS = {
  open: 'Em andamento',
  pending: 'Pendente',
  resolved: 'Resolvido',
  snoozed: 'Adiado',
};

export const LEAD_FLAGS = [
  { key: 'SEGURADO', label: 'Segurado', upper: 'SEGURADO' },
  { key: 'Iniciou_coleta', label: 'Iniciou coleta', upper: 'INICIOU COLETA' },
  { key: 'Contrato_enviado', label: 'Contrato enviado', upper: 'CONTRATO ENVIADO' },
  {
    key: 'Contrato_assinado',
    label: 'Contrato assinado',
    upper: 'CONTRATO ASSINADO',
  },
  { key: 'video_assinatura', label: 'Assinatura enviada', upper: 'ASSINATURA ENVIADA' },
  {
    key: 'Atendimento_humano',
    label: 'Atendimento humano',
    upper: 'ATEND. HUMANO',
  },
];
