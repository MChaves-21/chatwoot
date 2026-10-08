/**
 * Dashboard IA — as contas.
 *
 * Funcoes puras, sem Vue e sem rede, de proposito: da para copiar este arquivo
 * e o constants.js para uma pasta e testar com node contra uma base sintetica
 * (mesmo metodo do kanban/stateBoard.js).
 *
 * Toda data vira dia (YYYY-MM-DD) e hora no fuso de Sao Paulo ANTES de
 * qualquer conta. Comparar dia como texto evita o erro classico de uma
 * conversa das 22h cair no dia seguinte por causa de UTC.
 */

import {
  ALL_FUNNELS_ID,
  CLOSING_BUCKETS,
  DASH_FUNNELS,
  DAY_PARTS,
  DDD_UF,
  LOST_LABELS,
} from './constants';
import { UNSTAGED_LABEL } from '../kanban/constants';

const DAY_MS = 86400000;

const SP_FORMAT = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Sao_Paulo',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  hour12: false,
});

/** { ymd: 'YYYY-MM-DD', hour: 0..23 } no fuso de Sao Paulo. */
export function spParts(ms) {
  const p = {};
  SP_FORMAT.formatToParts(new Date(ms)).forEach(x => {
    p[x.type] = x.value;
  });
  return {
    ymd: `${p.year}-${p.month}-${p.day}`,
    hour: Number(p.hour) % 24,
  };
}

/** Soma dias a um YYYY-MM-DD sem passar por fuso. */
export function shiftYmd(ymd, delta) {
  const [y, m, d] = ymd.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + delta));
  return dt.toISOString().slice(0, 10);
}

/** Dia da semana (0 = domingo) de um YYYY-MM-DD, sem passar por fuso. */
export function weekdayOf(ymd) {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

export function ymdToBR(ymd) {
  const [, m, d] = ymd.split('-');
  return `${d}/${m}`;
}

function daysBetween(fromYmd, toYmd) {
  return Math.round((Date.parse(toYmd) - Date.parse(fromYmd)) / DAY_MS);
}

function daysInMonth(ymd) {
  const [y, m] = ymd.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

function toMs(v) {
  if (v === null || v === undefined) return null;
  const d = typeof v === 'number' ? new Date(v * 1000) : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.getTime();
}

function pct(part, whole) {
  return whole > 0 ? (part / whole) * 100 : 0;
}

// ------------------------------------------------------------------ linhas

const FUNNEL_BY_INBOX = new Map(DASH_FUNNELS.map(f => [f.inboxId, f]));
const FUNNEL_BY_ID = new Map(DASH_FUNNELS.map(f => [f.id, f]));

export function funnelById(id) {
  return FUNNEL_BY_ID.get(id) || null;
}

/** UF pelo DDD do telefone. `null` quando o numero nao e brasileiro ou e curto. */
export function ufFromPhone(raw) {
  const text = String(raw || '').trim();
  let d = text.replace(/\D/g, '');
  if (d.startsWith('55') && d.length >= 12 && d.length <= 13) d = d.slice(2);
  // Numero com "+" que nao e +55 e estrangeiro: sem isto, um +1 202... de 11
  // digitos viraria DDD 12 e contaria como Sao Paulo.
  else if (text.startsWith('+')) return null;
  if (d.length < 10 || d.length > 11) return null;
  return DDD_UF[Number(d.slice(0, 2))] || null;
}

/**
 * Reduz a conversa do Chatwoot ao que o painel usa. O telefone NAO fica na
 * linha — so a UF tirada do DDD. O painel nao precisa de mais que isso, e o
 * que nao esta na memoria nao vaza.
 *
 * Devolve `null` para conversa de caixa que nao pertence a nenhum funil.
 */
export function toRow(conv, extra = {}) {
  const funnel = FUNNEL_BY_INBOX.get(conv.inbox_id);
  if (!funnel) return null;

  const labels = Array.isArray(conv.labels) ? conv.labels : [];
  const stageLabels = funnel.columns.map(c => c.label);
  // Regra do Kanban (convStageLabel): vale a primeira etiqueta de etapa que a
  // conversa tem; sem nenhuma, "Sem etapa". Com UMA diferenca: etiqueta de
  // descarte vence. Em 07/10/2026 havia 10 conversas com `desqualificado` E
  // outra etapa ao mesmo tempo — sem a precedencia, lead ja descartado contaria
  // como lead em andamento no funil (mesma decisao do quadro "Por estado").
  const mine = labels.filter(l => stageLabels.includes(l));
  const stage =
    mine.find(l => LOST_LABELS.includes(l)) || mine[0] || UNSTAGED_LABEL;

  const createdMs = toMs(conv.created_at ?? conv.timestamp);
  const updatedMs =
    toMs(conv.last_activity_at ?? conv.timestamp ?? conv.created_at) ||
    createdMs;
  if (!createdMs) return null;

  const created = spParts(createdMs);
  const sender = (conv.meta && conv.meta.sender) || {};
  const assignee = (conv.meta && conv.meta.assignee) || null;
  const rank = funnel.path.indexOf(stage);
  // { etiqueta: ms } — quando cada etiqueta foi aplicada pela primeira vez.
  const history = extra.history || {};
  const signedRank = funnel.signedFrom
    ? funnel.path.indexOf(funnel.signedFrom)
    : -1;
  const qualifiedRank = funnel.path.indexOf(funnel.qualifiedFrom);

  return {
    id: conv.id,
    funnelId: funnel.id,
    stage,
    rank,
    lost: LOST_LABELS.includes(stage),
    signed: signedRank >= 0 && rank >= signedRank,
    // Com o historico do servidor, "qualificado" passa a ser quem ALGUMA VEZ
    // chegou na etapa de qualificado ou alem — inclusive quem foi descartado
    // depois. Sem historico, vale so a etapa atual.
    qualified:
      qualifiedRank >= 0 &&
      (rank >= qualifiedRank ||
        funnel.path.some((l, i) => i >= qualifiedRank && history[l])),
    history,
    createdMs,
    createdYmd: created.ymd,
    createdHour: created.hour,
    // 0 = domingo. Calculado do dia em Sao Paulo, nao do fuso do navegador.
    createdWeekday: weekdayOf(created.ymd),
    updatedYmd: spParts(updatedMs).ymd,
    assigneeId: assignee ? assignee.id : 0,
    assigneeName: assignee ? assignee.name : 'Não atribuído',
    uf: extra.uf !== undefined ? extra.uf : ufFromPhone(sender.phone_number),
  };
}

/**
 * Linha a partir do formato enxuto do endpoint do servidor:
 * [id, inbox_id, etiquetas, criada, ultima atividade, responsavel, ddd].
 * `stages` e { etiqueta: epoch } daquela conversa; `agents` e { id: nome }.
 */
export function toRowFromSnapshot(item, { agents = {}, stages = {} } = {}) {
  const [id, inboxId, labels, createdAt, lastActivityAt, assigneeId, ddd] =
    item;
  const history = {};
  Object.entries(stages).forEach(([label, at]) => {
    history[label] = at * 1000;
  });
  return toRow(
    {
      id,
      inbox_id: inboxId,
      labels,
      created_at: createdAt,
      last_activity_at: lastActivityAt,
      meta: {
        sender: {},
        assignee: assigneeId
          ? { id: assigneeId, name: agents[assigneeId] || `Agente ${assigneeId}` }
          : null,
      },
    },
    { uf: ddd ? DDD_UF[Number(ddd)] || null : null, history }
  );
}

/**
 * Data da assinatura pelo historico: a primeira vez que a conversa recebeu a
 * etiqueta de contrato assinado ou de qualquer etapa posterior.
 */
export function signedAtFromHistory(row) {
  const funnel = FUNNEL_BY_ID.get(row.funnelId);
  if (!funnel || !funnel.signedFrom) return null;
  const from = funnel.path.indexOf(funnel.signedFrom);
  const times = funnel.path
    .slice(from)
    .map(l => row.history[l])
    .filter(Boolean);
  return times.length ? Math.min(...times) : null;
}

// ------------------------------------------------------------------ filtros

/** Intervalo do periodo em dias { from, to } (inclusivos) ou null para "tudo". */
export function periodRange(key, todayYmd, custom = {}) {
  switch (key) {
    case 'custom': {
      // Sem as duas datas ainda nao ha filtro; datas invertidas sao trocadas.
      if (!custom.from || !custom.to) return null;
      return custom.from <= custom.to
        ? { from: custom.from, to: custom.to }
        : { from: custom.to, to: custom.from };
    }
    case 'hoje':
      return { from: todayYmd, to: todayYmd };
    case 'ontem':
      return { from: shiftYmd(todayYmd, -1), to: shiftYmd(todayYmd, -1) };
    case '7d':
      return { from: shiftYmd(todayYmd, -6), to: todayYmd };
    case '30d':
      return { from: shiftYmd(todayYmd, -29), to: todayYmd };
    case 'mes':
      return { from: `${todayYmd.slice(0, 7)}-01`, to: todayYmd };
    default:
      return null;
  }
}

/** Funil e responsavel — os filtros que valem para o painel inteiro. */
export function filterScope(rows, { funnelId, assigneeId }) {
  return rows.filter(
    r =>
      (funnelId === ALL_FUNNELS_ID || r.funnelId === funnelId) &&
      (assigneeId === null || r.assigneeId === assigneeId)
  );
}

/**
 * O periodo imediatamente anterior, do mesmo tamanho — base das setas de
 * "subiu/caiu" dos indicadores. `null` quando nao ha periodo (Todo periodo,
 * personalizado incompleto).
 */
export function previousRange(period, todayYmd, custom = {}) {
  const range = periodRange(period, todayYmd, custom);
  if (!range) return null;
  if (period === 'mes') {
    // Este mes x mesmo trecho do mes passado (1 ao dia de hoje).
    const [y, m] = todayYmd.split('-').map(Number);
    const prev = new Date(Date.UTC(y, m - 2, 1));
    const py = prev.getUTCFullYear();
    const pm = String(prev.getUTCMonth() + 1).padStart(2, '0');
    const last = new Date(Date.UTC(py, prev.getUTCMonth() + 1, 0)).getUTCDate();
    const day = Math.min(Number(todayYmd.slice(8, 10)), last);
    return { from: `${py}-${pm}-01`, to: `${py}-${pm}-${String(day).padStart(2, '0')}` };
  }
  const len = daysBetween(range.from, range.to) + 1;
  return { from: shiftYmd(range.from, -len), to: shiftYmd(range.from, -1) };
}

export function filterRange(rows, range, mode) {
  if (!range) return rows;
  const field = mode === 'atualizacao' ? 'updatedYmd' : 'createdYmd';
  return rows.filter(r => r[field] >= range.from && r[field] <= range.to);
}

export function filterPeriod(rows, { period, mode, todayYmd, custom }) {
  const range = periodRange(period, todayYmd, custom);
  if (!range) return rows;
  const field = mode === 'atualizacao' ? 'updatedYmd' : 'createdYmd';
  return rows.filter(r => r[field] >= range.from && r[field] <= range.to);
}

export function assigneeOptions(rows) {
  const map = new Map();
  rows.forEach(r => {
    const cur = map.get(r.assigneeId) || {
      id: r.assigneeId,
      name: r.assigneeName,
      count: 0,
    };
    cur.count += 1;
    map.set(r.assigneeId, cur);
  });
  return [...map.values()].sort((a, b) => b.count - a.count);
}

// --------------------------------------------------------------- indicadores

/**
 * Os cinco numeros do topo.
 *
 * Uma limitacao que vale conhecer: a etiqueta guarda so a etapa ATUAL. Um
 * lead que chegou ao Comercial e depois foi desqualificado aparece como
 * perdido, nao como qualificado. Por isso "qualificado" e "avancaram" contam
 * quem ESTA do Comercial em diante hoje, e tendem a ficar abaixo do real.
 */
export function kpis(rows) {
  const total = rows.length;
  const signed = rows.filter(r => r.signed).length;
  const qualified = rows.filter(r => r.qualified).length;
  const lost = rows.filter(r => r.lost).length;
  return {
    total,
    signed,
    qualified,
    lost,
    conversion: pct(signed, total),
    efficiency: pct(signed, qualified),
    qualifiedPct: pct(qualified, total),
    lostPct: pct(lost, total),
  };
}

/** Uma linha por coluna do Kanban, na ordem do Kanban, com a contagem atual. */
export function stageTable(rows, funnel) {
  const mine = rows.filter(r => r.funnelId === funnel.id);
  const counts = {};
  mine.forEach(r => {
    counts[r.stage] = (counts[r.stage] || 0) + 1;
  });
  const columns = funnel.columns.slice();
  // Funil sem coluna "Sem etapa" (Auxilio, Trabalhista): a linha entra so se
  // houver conversa nela, senao o total da tabela nao fecha com o do topo.
  if (
    !columns.some(c => c.label === UNSTAGED_LABEL) &&
    counts[UNSTAGED_LABEL]
  ) {
    columns.unshift({
      title: 'Sem etapa',
      label: UNSTAGED_LABEL,
      color: '#94a3b8',
    });
  }
  return columns.map(c => ({
    label: c.label,
    title: c.title,
    color: c.color,
    count: counts[c.label] || 0,
    pct: pct(counts[c.label] || 0, mine.length),
    kind: LOST_LABELS.includes(c.label)
      ? 'lost'
      : funnel.path.includes(c.label)
        ? 'path'
        : 'wait',
  }));
}

/**
 * Funil acumulado: em cada etapa, quantos leads estao NELA OU ALEM dela.
 * Perdidos e em espera ficam fora — nao da para saber ate onde chegaram.
 * `next` e a passagem para a etapa seguinte.
 */
export function funnelSteps(rows, funnel) {
  const mine = rows.filter(r => r.funnelId === funnel.id);
  const onPath = mine.filter(r => r.rank >= 0);
  const titles = new Map(funnel.columns.map(c => [c.label, c.title]));
  titles.set(UNSTAGED_LABEL, titles.get(UNSTAGED_LABEL) || 'Sem etapa');

  const steps = funnel.path.map((label, i) => {
    const reached = onPath.filter(r => r.rank >= i).length;
    return {
      label,
      title: titles.get(label) || label,
      reached,
      pct: pct(reached, mine.length),
    };
  });
  steps.forEach((s, i) => {
    const nxt = steps[i + 1];
    s.next = nxt ? pct(nxt.reached, s.reached) : null;
  });
  return {
    total: mine.length,
    off: mine.length - onPath.length,
    steps,
  };
}

/**
 * Curvas dos indicadores do topo: as ultimas 12 semanas, pela data de
 * criacao da conversa. Cada ponto e uma semana (a ultima termina hoje).
 * Sao dados reais do filtro de funil/responsavel, nao enfeite.
 */
export function weeklySeries(rows, { todayYmd, weeks = 12 }) {
  const buckets = [];
  for (let i = weeks - 1; i >= 0; i -= 1) {
    buckets.push({
      from: shiftYmd(todayYmd, -(7 * i + 6)),
      to: shiftYmd(todayYmd, -7 * i),
      total: 0,
      signed: 0,
      qualified: 0,
    });
  }
  const first = buckets[0].from;
  rows.forEach(r => {
    if (r.createdYmd < first || r.createdYmd > todayYmd) return;
    const b = buckets.find(x => r.createdYmd >= x.from && r.createdYmd <= x.to);
    if (!b) return;
    b.total += 1;
    if (r.signed) b.signed += 1;
    if (r.qualified) b.qualified += 1;
  });
  return {
    total: buckets.map(b => b.total),
    signed: buckets.map(b => b.signed),
    conversion: buckets.map(b => pct(b.signed, b.total)),
    efficiency: buckets.map(b => pct(b.signed, b.qualified)),
    qualifiedPct: buckets.map(b => pct(b.qualified, b.total)),
  };
}

/** Ranking por responsavel: volume, qualificados, contratos e conversao. */
export function byAssignee(rows) {
  const map = new Map();
  rows.forEach(r => {
    const cur = map.get(r.assigneeId) || {
      id: r.assigneeId,
      name: r.assigneeName,
      total: 0,
      qualified: 0,
      signed: 0,
    };
    cur.total += 1;
    if (r.qualified) cur.qualified += 1;
    if (r.signed) cur.signed += 1;
    map.set(r.assigneeId, cur);
  });
  return [...map.values()]
    .map(a => ({ ...a, conversion: pct(a.signed, a.total) }))
    // "Nao atribuido" (id 0) nao e uma pessoa: fica sempre por ultimo, fora
    // da disputa de posicao.
    .sort(
      (a, b) =>
        (a.id === 0) - (b.id === 0) ||
        b.signed - a.signed ||
        b.total - a.total
    );
}

/**
 * Tempo medio em cada etapa do caminho, pelo historico de etiquetas: da
 * entrada na etapa ate a entrada na PROXIMA etapa registrada.
 *
 * So entram conversas que tem as duas datas; etapa sem nenhuma passagem
 * registrada fica com n = 0. Sem historico (plano B), devolve tudo zerado.
 */
export function stageDurations(rows, funnel) {
  const titles = new Map(funnel.columns.map(c => [c.label, c.title]));
  const colors = new Map(funnel.columns.map(c => [c.label, c.color]));
  const mine = rows.filter(r => r.funnelId === funnel.id);
  return funnel.path
    .map((label, i) => {
      const days = [];
      mine.forEach(r => {
        const at = r.history[label];
        if (!at) return;
        const later = funnel.path
          .slice(i + 1)
          .map(l => r.history[l])
          .filter(t => t && t >= at);
        if (later.length) days.push((Math.min(...later) - at) / DAY_MS);
      });
      const sorted = days.slice().sort((a, b) => a - b);
      return {
        label,
        title: titles.get(label) || label,
        color: colors.get(label),
        n: days.length,
        avgDays: days.length
          ? days.reduce((a, b) => a + b, 0) / days.length
          : 0,
        medianDays: sorted.length ? sorted[Math.floor(sorted.length / 2)] : 0,
      };
    })
    .filter(s => s.label !== UNSTAGED_LABEL);
}

// ------------------------------------------------------ tempo ate fechamento

/**
 * `signedAt` e o mapa { idDaConversa: ms } que vem do historico (api.js).
 * Contrato sem data localizada entra em `missing` e fica FORA da media — uma
 * data chutada aqui estragaria justamente o numero que o bloco mostra.
 */
export function closing(rows, signedAt) {
  const signed = rows.filter(r => r.signed);
  const days = [];
  signed.forEach(r => {
    const at = signedAt[r.id];
    if (at && at >= r.createdMs) days.push((at - r.createdMs) / DAY_MS);
  });
  const buckets = CLOSING_BUCKETS.map(b => ({ ...b, count: 0 }));
  days.forEach(d => {
    buckets.find(b => d < b.max).count += 1;
  });
  buckets.forEach(b => {
    b.pct = pct(b.count, days.length);
  });
  const avg = days.length ? days.reduce((a, b) => a + b, 0) / days.length : 0;
  const sorted = days.slice().sort((a, b) => a - b);
  const median = sorted.length
    ? (sorted[Math.floor((sorted.length - 1) / 2)] +
        sorted[Math.ceil((sorted.length - 1) / 2)]) /
      2
    : 0;
  return {
    n: days.length,
    missing: signed.length - days.length,
    avgDays: avg,
    avgHours: avg * 24,
    medianDays: median,
    buckets,
  };
}

// --------------------------------------------------------------------- meta

/**
 * Meta do mes corrente. Conta contrato pela DATA DA ASSINATURA, nao pela data
 * de criacao do lead — lead de agosto que assinou em outubro e de outubro.
 */
export function monthlyGoal(rows, signedAt, { goal, todayYmd }) {
  const month = todayYmd.slice(0, 7);
  const total = daysInMonth(todayYmd);
  const dayNow = Number(todayYmd.slice(8, 10));
  const perDay = new Array(total).fill(0);
  let missing = 0;

  rows
    .filter(r => r.signed)
    .forEach(r => {
      const at = signedAt[r.id];
      if (!at) {
        missing += 1;
        return;
      }
      const ymd = spParts(at).ymd;
      if (ymd.slice(0, 7) === month) perDay[Number(ymd.slice(8, 10)) - 1] += 1;
    });

  const done = perDay.reduce((a, b) => a + b, 0);
  const projection = dayNow > 0 ? Math.round((done / dayNow) * total) : 0;
  const left = Math.max(goal - done, 0);
  const daysLeft = total - dayNow;
  let bestDay = null;
  perDay.forEach((n, i) => {
    if (n > 0 && (!bestDay || n > bestDay.count))
      bestDay = { day: i + 1, count: n };
  });

  let acc = 0;
  const series = perDay.map((n, i) => {
    acc += n;
    return {
      day: i + 1,
      done: i < dayNow ? acc : null,
      // Projecao: do realizado de hoje ate o fim do mes, no ritmo medio atual.
      projection:
        i + 1 >= dayNow ? done + (done / dayNow) * (i + 1 - dayNow) : null,
      target: (goal / total) * (i + 1),
    };
  });

  return {
    goal,
    done,
    donePct: pct(done, goal),
    left,
    projection,
    projectionPct: pct(projection, goal),
    neededPerDay: daysLeft > 0 ? left / daysLeft : left,
    daysLeft,
    bestDay,
    series,
    missing,
    month,
  };
}

// --------------------------------------------------------------- novos chats

export function newChats(rows, { days, todayYmd }) {
  const from = shiftYmd(todayYmd, -(days - 1));
  const prevFrom = shiftYmd(from, -days);
  const byDay = new Map();
  for (let i = 0; i < days; i += 1) byDay.set(shiftYmd(from, i), 0);

  const hours = new Array(24).fill(0);
  // grid[diaDaSemana][hora]: quando os leads chegam, cruzando os dois.
  const grid = Array.from({ length: 7 }, () => new Array(24).fill(0));
  let previous = 0;
  rows.forEach(r => {
    if (r.createdYmd >= from && r.createdYmd <= todayYmd) {
      byDay.set(r.createdYmd, byDay.get(r.createdYmd) + 1);
      hours[r.createdHour] += 1;
      grid[r.createdWeekday][r.createdHour] += 1;
    } else if (r.createdYmd >= prevFrom && r.createdYmd < from) {
      previous += 1;
    }
  });

  const series = [...byDay.entries()].map(([ymd, count]) => ({ ymd, count }));
  // Media movel de ate 7 dias (os dias anteriores disponiveis na janela).
  series.forEach((s, i) => {
    const win = series.slice(Math.max(0, i - 6), i + 1);
    s.avg = win.reduce((a, w) => a + w.count, 0) / win.length;
  });
  const total = series.reduce((a, s) => a + s.count, 0);
  const peak = series.reduce((a, s) => (s.count > a.count ? s : a), series[0]);

  // Tendencia: segunda metade do periodo contra a primeira.
  const half = Math.floor(days / 2);
  const first = series.slice(0, half).reduce((a, s) => a + s.count, 0);
  const second = series.slice(days - half).reduce((a, s) => a + s.count, 0);
  const trend = first > 0 ? ((second - first) / first) * 100 : null;

  const parts = DAY_PARTS.map(p => {
    const count = hours.slice(p.from, p.to).reduce((a, b) => a + b, 0);
    return { key: p.key, title: p.title, count, pct: pct(count, total) };
  });
  const peakHour = hours.indexOf(Math.max(...hours));

  return {
    days,
    total,
    avg: total / days,
    peak,
    trend,
    series,
    parts,
    hours: hours.map((count, hour) => ({ hour, count })),
    grid,
    peakHour: total ? peakHour : null,
    previous,
    change: previous > 0 ? ((total - previous) / previous) * 100 : null,
    top: series
      .slice()
      .sort((a, b) => b.count - a.count)
      .slice(0, 5)
      .filter(s => s.count > 0)
      .map(s => ({ ...s, pct: pct(s.count, total) })),
  };
}

// -------------------------------------------------------------------- estados

export function byState(rows) {
  const map = new Map();
  let unknown = 0;
  rows.forEach(r => {
    if (!r.uf) {
      unknown += 1;
      return;
    }
    const cur = map.get(r.uf) || { uf: r.uf, leads: 0, signed: 0 };
    cur.leads += 1;
    if (r.signed) cur.signed += 1;
    map.set(r.uf, cur);
  });
  const known = rows.length - unknown;
  const list = [...map.values()]
    .map(s => ({ ...s, pct: pct(s.leads, known) }))
    .sort((a, b) => b.leads - a.leads || a.uf.localeCompare(b.uf));
  return { list, unknown, known };
}

/** Dias corridos entre duas datas YYYY-MM-DD (exportado para o teste). */
export { daysBetween };
