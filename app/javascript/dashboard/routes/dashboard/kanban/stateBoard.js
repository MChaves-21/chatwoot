/**
 * Kanban por estado — regras de classificacao.
 *
 * Funcoes puras, sem Vue e sem rede, de proposito: sao a parte do sistema que
 * mais precisa estar certa (a contagem que vai para o grupo duas vezes por
 * dia) e a mais facil de testar isoladamente.
 */

import {
  CLOSED_LABELS,
  SHARED_ACCOUNT_NAME,
  STATE_COLUMNS,
  TABLE_COLUMNS,
  UNASSIGNED_TITLE,
} from './stateConstants';

// --------------------------------------------------------------- tempo

/** Timestamp unix (segundos) da ultima atividade. */
export function lastActivityTs(conv) {
  return conv.last_activity_at || conv.timestamp || conv.updated_at || 0;
}

/**
 * Dias parada. Conversa sem timestamp nenhum devolve Infinity — cai na faixa
 * mais parada, que e onde ela deve aparecer para alguem olhar.
 */
export function idleDays(conv, nowMs = Date.now()) {
  const ts = lastActivityTs(conv);
  if (!ts) return Infinity;
  return (nowMs / 1000 - ts) / 86400;
}

/** Inicio do dia local, em segundos. */
export function startOfDayTs(now = new Date()) {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  return Math.floor(d.getTime() / 1000);
}

export function isActiveSince(conv, sinceTs) {
  return lastActivityTs(conv) >= sinceTs;
}

export function isCreatedSince(conv, sinceTs) {
  return (conv.created_at || 0) >= sinceTs;
}

// --------------------------------------------------------- classificacao

export function convLabelList(conv) {
  return conv.labels || (conv.meta && conv.meta.labels) || [];
}

export function isClosed(conv) {
  return convLabelList(conv).some(l => CLOSED_LABELS.includes(l));
}

/** A conversa casa com a regra desta coluna? Nao considera prioridade. */
export function matchesColumn(conv, col, nowMs = Date.now()) {
  switch (col.kind) {
    case 'anyLabel':
      return convLabelList(conv).some(l => (col.labels || []).includes(l));

    case 'status':
      return (col.status || []).includes(conv.status);

    case 'openUnreplied':
      return conv.status === 'open' && !conv.first_reply_created_at;

    case 'openReplied': {
      if (conv.status !== 'open' || !conv.first_reply_created_at) return false;
      const d = idleDays(conv, nowMs);
      if (col.minIdleDays != null && d < col.minIdleDays) return false;
      if (col.maxIdleDays != null && d >= col.maxIdleDays) return false;
      return true;
    }

    default:
      return false;
  }
}

/** Colunas na ordem de classificacao (menor priority primeiro). */
export function columnsByPriority(columns = STATE_COLUMNS) {
  return [...columns].sort((a, b) => a.priority - b.priority);
}

/**
 * A coluna da conversa. Devolve a chave, ou null se nada casar — o que so
 * acontece se o Chatwoot ganhar um status novo. Nesse caso a conversa fica de
 * fora do quadro E aparece no contador de "nao classificadas", porque sumir em
 * silencio e pior que aparecer errado.
 */
export function classify(conv, columns = STATE_COLUMNS, nowMs = Date.now()) {
  const hit = columnsByPriority(columns).find(c =>
    matchesColumn(conv, c, nowMs)
  );
  return hit ? hit.key : null;
}

/**
 * Classifica uma lista inteira.
 * Devolve { byKey: {chave: [conversas]}, unclassified: [conversas] }.
 */
export function classifyAll(
  conversations,
  columns = STATE_COLUMNS,
  nowMs = Date.now()
) {
  const byKey = {};
  columns.forEach(c => {
    byKey[c.key] = [];
  });
  const unclassified = [];

  const ordered = columnsByPriority(columns);
  conversations.forEach(conv => {
    const hit = ordered.find(c => matchesColumn(conv, c, nowMs));
    if (hit) byKey[hit.key].push(conv);
    else unclassified.push(conv);
  });

  return { byKey, unclassified };
}

// ---------------------------------------------------------------- agente

/**
 * Responsavel pela conversa, pelo campo `assignee`.
 *
 * ATENCAO ao interpretar: em 10/08/2026, 73% das conversas nao tinham
 * responsavel nenhum. Este campo mede quem ASSUMIU, nao quem trabalhou. Para
 * "quem atendeu de fato" use attendantsFromMessages().
 */
export function assigneeName(conv) {
  const a = conv.meta && conv.meta.assignee;
  const name = a && (a.name || a.available_name);
  return name || null;
}

/**
 * Quem enviou mensagem de saida na conversa, opcionalmente so depois de
 * `sinceTs`. `message_type === 1` e mensagem de saida no Chatwoot.
 *
 * Este e o sinal mais honesto de "atendeu": nao depende de ninguem lembrar de
 * se atribuir. O limite e que a caixa 6 (Auxilio Acidente) responde 100% pela
 * conta da empresa — la nao ha como separar pessoa.
 */
export function attendantsFromMessages(messages = [], sinceTs = 0) {
  const names = new Set();
  messages.forEach(m => {
    if (m.message_type !== 1) return;
    if (sinceTs && (m.created_at || 0) < sinceTs) return;
    const s = m.sender || {};
    // Mensagem automatica sem remetente identificado nao vira pessoa.
    if (s.type && s.type !== 'user') return;
    const name = s.name || s.available_name;
    if (name) names.add(name);
  });
  return [...names];
}

// ---------------------------------------------------------------- tabela

/** Soma as colunas detalhadas nas colunas condensadas da tabela. */
export function condense(countsByKey) {
  const out = {};
  TABLE_COLUMNS.forEach(tc => {
    out[tc.key] = tc.from.reduce((sum, k) => sum + (countsByKey[k] || 0), 0);
  });
  return out;
}

/**
 * Monta a tabela "estoque agora": uma linha por responsavel, colunas
 * condensadas, mais TOTAL.
 *
 * `rowFor` decide a linha de cada conversa. Por padrao e o responsavel; a
 * tabela do dia passa uma funcao diferente (quem atendeu).
 */
export function buildTable(
  conversations,
  { columns = STATE_COLUMNS, nowMs = Date.now(), rowFor = assigneeName } = {}
) {
  const rows = new Map();

  /**
   * Contagem por coluna sobre conversas DISTINTAS.
   *
   * Nao da para somar as linhas para chegar no TOTAL: quando duas pessoas
   * atendem a mesma conversa no mesmo dia, ela aparece nas duas linhas — que e
   * o certo, as duas trabalharam nela — mas so existe uma conversa. Somando as
   * linhas o TOTAL sai inflado (aconteceu na verificacao de 10/08/2026: 58
   * para 57 conversas). Numa tabela que vai para o grupo, um total que nao
   * bate com a realidade destroi a confianca no resto dos numeros.
   */
  const distinct = {};
  let distinctTotal = 0;

  const touch = name => {
    if (!rows.has(name)) rows.set(name, { name, counts: {}, total: 0 });
    return rows.get(name);
  };

  conversations.forEach(conv => {
    const key = classify(conv, columns, nowMs);
    if (!key) return;

    distinct[key] = (distinct[key] || 0) + 1;
    distinctTotal += 1;

    // rowFor pode devolver uma pessoa, varias (atenderam juntas) ou nada.
    let who = rowFor(conv);
    if (!Array.isArray(who)) who = who ? [who] : [];
    if (!who.length) who = [UNASSIGNED_TITLE];

    who.forEach(name => {
      const row = touch(name);
      row.counts[key] = (row.counts[key] || 0) + 1;
      row.total += 1;
    });
  });

  const list = [...rows.values()].map(r => ({
    name: r.name,
    counts: condense(r.counts),
    total: r.total,
  }));

  // Ordem: pessoas por volume, "Nao atribuidas" sempre por ultimo. Uma linha
  // gigante de nao atribuidas no topo empurra as pessoas para fora da foto.
  list.sort((a, b) => {
    if (a.name === UNASSIGNED_TITLE) return 1;
    if (b.name === UNASSIGNED_TITLE) return -1;
    if (a.name === SHARED_ACCOUNT_NAME) return -1;
    if (b.name === SHARED_ACCOUNT_NAME) return 1;
    return b.total - a.total;
  });

  const total = {
    name: 'TOTAL',
    counts: condense(distinct),
    total: distinctTotal,
  };

  /**
   * `sharedRows` avisa que as linhas somam mais que o TOTAL, o que e correto
   * mas parece erro para quem le. A tela usa isso para mostrar uma nota de
   * rodape em vez de deixar o leitor desconfiando da conta.
   */
  const rowSum = list.reduce((s, r) => s + r.total, 0);

  return { rows: list, total, sharedRows: rowSum - distinctTotal };
}
