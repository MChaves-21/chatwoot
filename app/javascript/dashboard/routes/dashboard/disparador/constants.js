/**
 * Disparador — 13/10/2026.
 *
 * Campanhas de mensagem para conversas que JA existem no Chatwoot, em qualquer
 * caixa. A tela so monta a campanha e acompanha; quem guarda e envia e o n8n:
 *
 *   - "DISPARADOR - API (webhook)"  POST /webhook/disparador-api
 *       valida a sessao do Chatwoot (GET /api/v1/profile, conta 1) e lista,
 *       detalha, cria, pausa, retoma e cancela. Calcula o horario de envio de
 *       cada destinatario na criacao (intervalo, pausas, janela e dias).
 *   - "DISPARADOR - Envio (cron)"  a cada minuto envia os vencidos, postando a
 *       mensagem na propria conversa (POST /conversations/:id/messages). A
 *       entrega no WhatsApp sai pelo caminho de sempre da caixa (uazapi ou API
 *       oficial), e o historico fica na conversa.
 *
 * Tabelas (n8n Data Tables): disparo_campanhas e disparo_destinatarios.
 *
 * Por que so conversas que ja existem: criar conversa em lote dispara o que
 * escuta `conversation_created` (o video do BPC — ver o incidente de 12/08 no
 * CONTEXTO-fork.md). Mensagem de SAIDA nao aciona nem a IA PREV nem a
 * Trabalhista: as duas param em "mensagem nao e do cliente" (conferido em
 * 13/10/2026).
 */
import { CLOSED_LABELS } from '../kanban/stateConstants';

export const DISPARADOR_URL =
  'https://n8n.goncalvesesilva.cloud/webhook/disparador-api';

/** Teto por campanha. O n8n recusa acima disso. */
export const MAX_RECIPIENTS = 3000;

/** Paginas de 25 conversas lidas em paralelo ao montar o publico. */
export const AUDIENCE_CONCURRENCY = 3;
export const MAX_AUDIENCE_PAGES = 160;

/**
 * Etiquetas que barram o envio por padrao: os descartes do escritorio, a mesma
 * lista do quadro por estado. O n8n confere de novo na hora de enviar, entao
 * um lead descartado depois de a campanha ser criada tambem nao recebe.
 */
export const DEFAULT_EXCLUDE = [...CLOSED_LABELS];

/**
 * Padrao conservador para numero da uazapi: um envio a cada 40-90 s, pausa de
 * 10 min a cada 30 e so em horario comercial de dias uteis. Da ~45 mensagens
 * por hora. Mais rapido que isso aumenta o risco de bloqueio do numero.
 */
export const DEFAULT_CONFIG = {
  intervalo_min: 40,
  intervalo_max: 90,
  pausa_a_cada: 30,
  pausa_minutos: 10,
  janela_inicio: '09:00',
  janela_fim: '17:30',
  dias: [1, 2, 3, 4, 5],
};

/** 1 = segunda ... 7 = domingo, igual ao n8n. */
export const WEEKDAYS = [
  { id: 1, label: 'Seg' },
  { id: 2, label: 'Ter' },
  { id: 3, label: 'Qua' },
  { id: 4, label: 'Qui' },
  { id: 5, label: 'Sex' },
  { id: 6, label: 'Sáb' },
  { id: 7, label: 'Dom' },
];

export const CONVERSATION_STATUSES = [
  { id: 'all', label: 'Todas' },
  { id: 'open', label: 'Abertas' },
  { id: 'pending', label: 'Pendentes' },
  { id: 'resolved', label: 'Resolvidas' },
];

export const VARIABLES = [
  { token: '{{primeiro_nome}}', label: 'Primeiro nome' },
  { token: '{{nome}}', label: 'Nome completo' },
];

/** Status da campanha como o n8n grava. "agendada" e a campanha ativa. */
export const CAMPAIGN_STATUS = {
  agendada: { label: 'Em andamento', tone: 'blue' },
  pausada: { label: 'Pausada', tone: 'amber' },
  concluida: { label: 'Concluída', tone: 'teal' },
  cancelada: { label: 'Cancelada', tone: 'slate' },
};

export const RECIPIENT_STATUS = {
  pendente: { label: 'Na fila', tone: 'slate' },
  reservado: { label: 'Enviando', tone: 'blue' },
  enviado: { label: 'Enviado', tone: 'teal' },
  erro: { label: 'Erro', tone: 'ruby' },
  pulado: { label: 'Pulado', tone: 'amber' },
  cancelado: { label: 'Cancelado', tone: 'slate' },
};

/** Classes de selo por tom. Tokens do Chatwoot, para funcionar no tema escuro. */
export const TONE_CLASS = {
  blue: 'bg-n-blue-3 text-n-blue-11',
  amber: 'bg-n-amber-3 text-n-amber-11',
  teal: 'bg-n-teal-3 text-n-teal-11',
  ruby: 'bg-n-ruby-3 text-n-ruby-11',
  slate: 'bg-n-alpha-2 text-n-slate-11',
};

/** Recarrega a lista sozinha enquanto houver campanha em andamento. */
export const REFRESH_MS = 20000;

export const TIME_ZONE = 'America/Fortaleza';
