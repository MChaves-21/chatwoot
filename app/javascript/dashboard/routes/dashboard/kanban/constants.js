/**
 * Kanban Comercial — constantes.
 *
 * Portado de kanban-comercial.vercel.app/index.html.
 * Base, account, token, proxy e segredo do proxy sairam: dentro do Chatwoot
 * a sessao do agente ja responde por tudo isso.
 *
 * 07/08/2026 — dois funis. Cada funil e um preset FECHADO, definido aqui no
 * codigo, com as suas colunas e a sua caixa de entrada. As colunas deixaram de
 * ser editaveis por agente (antes viviam no localStorage, o que significava que
 * cada navegador tinha um quadro diferente). Com dois funis isso viraria
 * bagunca: um agente com preset antigo em cache misturaria etapas dos dois.
 */

import { STATE_FUNNEL_ID, STATE_INBOX_IDS } from './stateConstants';

/** Coluna sintetica: conversas da caixa que ainda nao tem etapa nenhuma. */
export const UNSTAGED_LABEL = '__sem_etapa__';

/**
 * Funil de Auxilio Acidente — caixa 6.
 *
 * lead_potencial e contrato_enviado entraram em 07/08/2026: as etiquetas
 * existiam e tinham conversa dentro (4 e 7 na epoca), mas nao havia coluna,
 * entao essas conversas eram invisiveis para a equipe.
 *
 * 11/08/2026 — "Contrato enviado" SAIU, fundida em "Aguardando Assinatura".
 * As duas ja estavam sobrepostas na pratica: das 7 conversas em
 * `contrato_enviado`, 6 tinham TAMBEM `aguardando_assinatura`, e apareciam
 * numa coluna ou na outra conforme a ordem em que a etiqueta foi gravada —
 * convStageLabel devolve a primeira que casa. Duas colunas para o mesmo
 * momento do processo so geravam card em lugar imprevisivel.
 *
 * A etiqueta `contrato_enviado` foi zerada na base junto com esta mudanca (as
 * 7 conversas passaram para `aguardando_assinatura`). Ela continua existindo
 * no Chatwoot, mas sem conversa e sem coluna.
 *
 * ATENCAO se algum fluxo do n8n voltar a aplicar `contrato_enviado`: este
 * funil NAO tem a coluna sintetica "Sem etapa" (so o BPC tem), entao a
 * conversa ficaria INVISIVEL no quadro — nao cairia em lugar nenhum. Se isso
 * acontecer, o conserto e o n8n passar a aplicar `aguardando_assinatura`.
 */
export const AUXILIO_COLUMNS = [
  { title: 'SDR', label: 'sdr', color: '#3b82f6' },
  { title: 'Lead potencial', label: 'lead_potencial', color: '#60a5fa' },
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

/**
 * Funil BPC — caixa 9. As 14 etiquetas foram criadas em 07/08/2026.
 *
 * O prefixo bpc_ e obrigatorio, nao estilo: cinco etapas tem nome identico no
 * funil de Auxilio Acidente. moveToStage apaga as etiquetas de etapa do funil
 * ativo antes de aplicar a nova; sem prefixo nao haveria como saber a qual
 * funil cada etiqueta pertence.
 *
 * A primeira coluna e sintetica. Nenhuma conversa do BPC tinha etiqueta de
 * etapa quando o quadro nasceu, e nao houve migracao do CRM antigo — sem essa
 * coluna o quadro abriria vazio e as 121 conversas existentes ficariam
 * invisiveis. A equipe arrasta de "Sem etapa" para a coluna certa conforme
 * atende cada lead.
 */
export const BPC_COLUMNS = [
  { title: 'Sem etapa', label: UNSTAGED_LABEL, color: '#94a3b8' },
  { title: 'Lead novo', label: 'bpc_lead_novo', color: '#3b82f6' },
  {
    title: 'Aguardando requisito de qualificacao',
    label: 'bpc_aguardando_requisito',
    color: '#6366f1',
  },
  {
    title: 'Lead qualificado / Negociacao',
    label: 'bpc_qualificado',
    color: '#8b5cf6',
  },
  {
    title: 'Solicitacao de documentos iniciais',
    label: 'bpc_documentos_iniciais',
    color: '#0ea5e9',
  },
  {
    title: 'Contrato enviado / Aguardando assinatura',
    label: 'bpc_aguardando_assinatura',
    color: '#f59e0b',
  },
  {
    title: 'Contrato assinado',
    label: 'bpc_contrato_assinado',
    color: '#22c55e',
  },
  { title: 'Pegar senha', label: 'bpc_pegar_senha', color: '#06b6d4' },
  { title: 'Analise medica', label: 'bpc_analise_medica', color: '#14b8a6' },
  { title: 'Analise juridica', label: 'bpc_analise_juridica', color: '#a855f7' },
  {
    title: 'Pos analise juridica - aguarda tempo ou docs',
    label: 'bpc_pos_juridica',
    color: '#eab308',
  },
  { title: 'Clientes efetivados', label: 'bpc_efetivado', color: '#16a34a' },
  { title: 'Desqualificado', label: 'bpc_desqualificado', color: '#ef4444' },
  { title: 'Cancelado', label: 'bpc_cancelado', color: '#dc2626' },
  {
    title: 'Fechado sem resposta',
    label: 'bpc_fechado_sem_resposta',
    color: '#64748b',
  },
];

/**
 * Os funis disponiveis. Acrescentar um terceiro e acrescentar um item aqui —
 * o seletor do cabecalho e o resto do quadro leem desta lista.
 *
 * inboxId e obrigatorio: sem ele o quadro leria as duas caixas misturadas, que
 * era o comportamento ate 07/08/2026.
 */
export const FUNNELS = [
  {
    id: 'auxilio_acidente',
    title: 'Auxílio Acidente',
    inboxId: 6,
    columns: AUXILIO_COLUMNS,
  },
  {
    id: 'bpc',
    title: 'BPC',
    inboxId: 9,
    columns: BPC_COLUMNS,
  },
  /**
   * Quadro por estado da conversa — 10/08/2026.
   *
   * Nao tem `columns` nem `inboxId`, e nao e esquecimento: as colunas saem do
   * status da conversa e do tempo parada (ver stateConstants.js), e o quadro
   * cruza as DUAS caixas em vez de uma. O `mode` e o que faz o Index.vue
   * renderizar StateBoard no lugar do quadro de etiquetas.
   */
  {
    id: STATE_FUNNEL_ID,
    title: 'Por estado',
    mode: 'state',
    inboxIds: STATE_INBOX_IDS,
    columns: [],
  },
];

export const DEFAULT_FUNNEL_ID = FUNNELS[0].id;

export function findFunnel(id) {
  return FUNNELS.find(f => f.id === id) || FUNNELS[0];
}

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
  [UNSTAGED_LABEL]: '❓',
  // Auxilio Acidente
  sdr: '📞',
  lead_potencial: '🔎',
  comercial: '💼',
  contrato_em_elaboracao: '📝',
  contrato_enviado: '📤',
  aguardando_assinatura: '✍️',
  contrato_assinado: '✅',
  analise_medica: '🩺',
  analise_juridica: '⚖️',
  efetivado: '🎉',
  desqualificado: '❌',
  descarte_sdr: '🗑️',
  aguardando_tempo: '⏳',
  // BPC
  bpc_lead_novo: '🆕',
  bpc_aguardando_requisito: '📋',
  bpc_qualificado: '💼',
  bpc_documentos_iniciais: '📎',
  bpc_aguardando_assinatura: '✍️',
  bpc_contrato_assinado: '✅',
  bpc_pegar_senha: '🔑',
  bpc_analise_medica: '🩺',
  bpc_analise_juridica: '⚖️',
  bpc_pos_juridica: '⏳',
  bpc_efetivado: '🎉',
  bpc_desqualificado: '❌',
  bpc_cancelado: '🚫',
  bpc_fechado_sem_resposta: '🔇',
};

/** Etiqueta que o quadro acrescenta ao mover um card na mao. */
export const MANUAL_LABEL = 'manual';

/**
 * Etiqueta que desliga o atendimento automatico do n8n para a conversa.
 *
 * Em 11/08/2026 estava em 222 das 518 conversas da base — nao e exclusiva de
 * etapa nenhuma, e o sinal de "daqui pra frente quem fala e gente".
 */
export const NO_AUTOMATION_LABEL = 'atendimento_humanizado';

/**
 * Etapas em que o lead deixou de ser lead: nao ha mais o que automatizar, e
 * continuar mandando mensagem para quem ja foi descartado e pior que nao
 * mandar nada.
 *
 * Cair numa destas etapas passa a aplicar NO_AUTOMATION_LABEL junto (ver
 * moveToStage). A regra existe porque depender de alguem lembrar nao funcionou:
 * na conferencia de 11/08/2026, 5 das 31 conversas finalizadas estavam sem a
 * etiqueta — ou seja, 5 pessoas ja desqualificadas seguiam no fluxo do robo.
 *
 * `efetivado`/`bpc_efetivado` NAO entram aqui de proposito: as duas de
 * `efetivado` ja tinham a etiqueta, mas "virou cliente" e uma decisao de
 * processo diferente de "foi descartado", e o usuario so pediu a segunda.
 */
export const DISQUALIFIED_LABELS = [
  'desqualificado',
  'descarte_sdr',
  'bpc_desqualificado',
  'bpc_cancelado',
  'bpc_fechado_sem_resposta',
];

/** Teto de paginas por coluna em "carregar tudo", para nao inundar a API. */
export const MAX_PAGES_PER_COLUMN = 200;

/**
 * Teto de paginas da coluna "Sem etapa". Ela nao da para pedir por etiqueta —
 * a API do Chatwoot nao tem "NOT label" — entao le a caixa inteira e filtra
 * aqui. Com 121 conversas na caixa BPC sao 5 requisicoes; o teto existe para o
 * dia em que a caixa crescer e alguem esquecer deste detalhe.
 */
export const MAX_PAGES_UNSTAGED = 40;

/**
 * Preferencias locais. Depois de 07/08/2026 guarda SO o funil aberto por
 * ultimo, o status e os dois webhooks do n8n que continuam externos. As
 * colunas sairam de proposito: sao preset por funil, no codigo.
 */
export const LS_KEY = 'cw_kanban_prefs_v5';

export const DEFAULT_PREFS = {
  funnelId: DEFAULT_FUNNEL_ID,
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
