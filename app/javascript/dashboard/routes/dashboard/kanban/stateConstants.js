/**
 * Kanban por estado — constantes.
 *
 * Arquivo novo, de proposito. O quadro por estado nao e um funil de etiquetas
 * como os outros dois: as colunas saem do `status` da conversa e do tempo
 * parada, nao de uma etiqueta. Manter isso separado de constants.js deixa o
 * diff com o upstream menor e evita que uma mudanca aqui quebre os funis
 * Auxilio Acidente e BPC.
 *
 * 10/08/2026 — desenhado depois de rodar as regras contra a base real (501
 * conversas). Os numeros que motivaram cada decisao estao nos comentarios.
 */

export const STATE_FUNNEL_ID = 'por_estado';

/** As duas caixas juntas. Este quadro cruza os dois funis de proposito. */
export const STATE_INBOX_IDS = [6, 9];

/** Etiquetas que significam "nao deu certo". Mantidas pelo sync do n8n. */
export const CLOSED_LABELS = ['desqualificado', 'descarte_sdr'];

/**
 * Colunas, em ordem de EXIBICAO.
 *
 * `priority` e outra coisa: e a ordem de classificacao. Uma conversa pode
 * casar com mais de uma regra (um desqualificado que tambem foi resolvido), e
 * um card nao pode estar em duas colunas. Vale a de menor `priority`.
 *
 * Fechado vence Resolvido de proposito: os dois significam "encerrado", mas o
 * Fechado diz POR QUE. Na ordem inversa, todo desqualificado que alguem
 * resolvesse sumiria da coluna Fechado e a conta de perdas ficaria menor que a
 * realidade.
 *
 * Consequencia a conhecer: um card em `desqualificado` aparece em Fechado
 * mesmo com a conversa ainda aberta. E intencional — o desfecho ja esta
 * decidido, nao ha trabalho pendente ali.
 *
 * Por que "Em atendimento" virou tres colunas: com uma so, ela ficava com 434
 * dos 501 cards (87%). Isso nao e um kanban, e uma lista. A quebra por tempo
 * parado revelou que 251 estao ha mais de 7 dias sem atividade — conversa
 * morta que ninguem encerrou, nao trabalho em andamento.
 */
export const STATE_COLUMNS = [
  {
    key: 'aberto',
    title: 'Aberto',
    color: '#3b82f6',
    priority: 7,
    kind: 'openUnreplied',
    hint: 'Cliente falou, agente ainda nao respondeu',
  },
  {
    key: 'atendimento_recente',
    title: 'Em atendimento · ate 2d',
    short: 'Atend. ate 2d',
    color: '#22c55e',
    priority: 4,
    kind: 'openReplied',
    maxIdleDays: 2,
    hint: 'Conversa em andamento, com atividade recente',
  },
  {
    key: 'atendimento_morno',
    title: 'Em atendimento · 2 a 7d',
    short: 'Atend. 2-7d',
    color: '#eab308',
    priority: 5,
    kind: 'openReplied',
    minIdleDays: 2,
    maxIdleDays: 7,
    hint: 'Sem atividade ha alguns dias',
  },
  {
    key: 'atendimento_parado',
    title: 'Em atendimento · +7d',
    short: 'Atend. +7d',
    color: '#ef4444',
    priority: 6,
    kind: 'openReplied',
    minIdleDays: 7,
    hint: 'Parada ha mais de uma semana. Provavelmente precisa ser encerrada',
  },
  {
    key: 'aguardando',
    title: 'Aguardando',
    color: '#f59e0b',
    priority: 3,
    // `snoozed` entra junto: as duas significam "parada, esperando". Ignorar
    // faria o TOTAL nao bater com o total real. Hoje ha 0 adiadas na base, so
    // que isso e foto do momento — conversa adiada reabre sozinha quando o
    // prazo vence, e o card muda de coluna sem ninguem mexer.
    kind: 'status',
    status: ['pending', 'snoozed'],
    hint: 'Respondida, esperando devolutiva do cliente',
  },
  {
    key: 'resolvido',
    title: 'Resolvido',
    color: '#16a34a',
    priority: 2,
    kind: 'status',
    status: ['resolved'],
    hint: 'Deu certo',
  },
  {
    key: 'fechado',
    title: 'Fechado',
    color: '#64748b',
    priority: 1,
    kind: 'anyLabel',
    labels: CLOSED_LABELS,
    hint: 'Nao deu certo (desqualificado ou descarte do SDR)',
  },
];

/**
 * Colunas condensadas para a tabela e para a imagem: as tres faixas de "Em
 * atendimento" viram uma so. Sete colunas nao cabem numa foto de celular.
 */
export const TABLE_COLUMNS = [
  {
    key: 'aberto',
    title: 'Aberto',
    color: '#3b82f6',
    from: ['aberto'],
    // Destacada na imagem: e a unica coluna que representa cliente esperando
    // resposta. As outras sao estado, esta e fila.
    accent: true,
  },
  {
    key: 'em_atendimento',
    title: 'Em atend.',
    color: '#22c55e',
    from: ['atendimento_recente', 'atendimento_morno', 'atendimento_parado'],
  },
  { key: 'aguardando', title: 'Aguard.', color: '#f59e0b', from: ['aguardando'] },
  { key: 'resolvido', title: 'Resolvido', color: '#16a34a', from: ['resolvido'] },
  { key: 'fechado', title: 'Fechado', color: '#64748b', from: ['fechado'] },
];

/**
 * Conta da empresa. Confirmado com o usuario em 10/08/2026: na pratica quem
 * opera este login e uma pessoa so (o gestor), entao ela entra na tabela como
 * agente nomeado em vez de virar uma linha "robo".
 *
 * Se um dia virar login compartilhado de verdade, separar por pessoa deixa de
 * ser possivel: nem `assignee` nem o remetente da mensagem distinguem quem
 * estava no teclado. Seria mudanca de rotina (um login por pessoa), nao de
 * codigo.
 */
export const SHARED_ACCOUNT_NAME = 'Gonçalves & Silva Advogados Associados';

export const UNASSIGNED_TITLE = 'Não atribuídas';

/**
 * Linha da tabela do dia para conversas que tiveram atividade mas nenhuma
 * mensagem de saida: o cliente falou e ninguem respondeu.
 *
 * Nao e a mesma coisa que "nao atribuida", e chamar as duas do mesmo jeito
 * escondia justamente o numero que interessa. Na verificacao de 10/08/2026
 * eram 32 de 57 conversas do dia — mais da metade.
 */
export const NO_REPLY_TITLE = 'Sem resposta hoje';

/**
 * Teto de paginas por caixa na varredura. Sao ~501 conversas hoje, ~21
 * requisicoes. O teto existe para o dia em que a base crescer e alguem
 * esquecer deste detalhe: em 200 paginas isto vira 5000 conversas e a tela
 * trava. Se chegar perto disso, a classificacao precisa virar endpoint no
 * servidor.
 */
export const MAX_PAGES_STATE = 60;

/** Concorrencia ao ler mensagens para descobrir quem atendeu. */
export const ATTENDANT_WORKERS = 4;

/**
 * Teto de conversas para as quais se busca "quem atendeu". A leitura custa uma
 * requisicao por conversa, entao so vale para o recorte do dia (~55 hoje).
 * Nunca para a base inteira.
 */
export const MAX_ATTENDANT_LOOKUPS = 200;
