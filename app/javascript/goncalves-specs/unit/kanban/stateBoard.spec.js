/**
 * Kanban por estado — regras de classificacao (stateBoard.js).
 * E a contagem que vai para o grupo as 12h e as 17h30.
 */
import {
  assigneeName,
  attendantsFromMessages,
  buildStateMatrix,
  buildTable,
  classify,
  classifyAll,
  columnsByPriority,
  condense,
  condensedKeyOf,
  convLabelList,
  idleDays,
  isActiveSince,
  isClosed,
  isCreatedSince,
  lastActivityTs,
  matchesColumn,
  scopeCutoffTs,
  startOfDayTs,
  teamName,
} from 'dashboard/routes/dashboard/kanban/stateBoard';
import {
  NO_TEAM_TITLE,
  SHARED_ACCOUNT_NAME,
  STATE_COLUMNS,
  UNASSIGNED_TITLE,
} from 'dashboard/routes/dashboard/kanban/stateConstants';

const NOW = Date.UTC(2026, 10, 4, 15, 0, 0);
const DAY = 86400;
const nowS = NOW / 1000;

const c = (over = {}) => ({
  id: 1,
  status: 'open',
  labels: [],
  last_activity_at: nowS,
  created_at: nowS - DAY,
  first_reply_created_at: null,
  meta: {},
  ...over,
});

describe('stateBoard — tempo', () => {
  it('lastActivityTs cai de last_activity_at para timestamp e updated_at', () => {
    expect(lastActivityTs({ last_activity_at: 3, timestamp: 2 })).toBe(3);
    expect(lastActivityTs({ timestamp: 2, updated_at: 1 })).toBe(2);
    expect(lastActivityTs({ updated_at: 1 })).toBe(1);
    expect(lastActivityTs({})).toBe(0);
  });

  it('idleDays mede dias parada; sem data e Infinity', () => {
    expect(idleDays(c({ last_activity_at: nowS - 3 * DAY }), NOW)).toBeCloseTo(
      3
    );
    expect(idleDays({}, NOW)).toBe(Infinity);
  });

  it('startOfDayTs e scopeCutoffTs contam dias inteiros (TZ do processo)', () => {
    const now = new Date(NOW);
    const start = startOfDayTs(now);
    expect(start).toBe(Date.UTC(2026, 10, 4) / 1000);
    expect(scopeCutoffTs(1, now)).toBe(start);
    expect(scopeCutoffTs(7, now)).toBe(start - 6 * DAY);
    expect(scopeCutoffTs(null, now)).toBe(0);
    expect(scopeCutoffTs(0, now)).toBe(0);
  });

  it('isActiveSince / isCreatedSince', () => {
    expect(isActiveSince(c(), nowS)).toBe(true);
    expect(isActiveSince(c(), nowS + 1)).toBe(false);
    expect(isCreatedSince(c(), nowS - DAY)).toBe(true);
    expect(isCreatedSince({}, 1)).toBe(false);
  });
});

describe('stateBoard — classificacao', () => {
  it('convLabelList le labels ou meta.labels', () => {
    expect(convLabelList({ labels: ['a'] })).toEqual(['a']);
    expect(convLabelList({ meta: { labels: ['b'] } })).toEqual(['b']);
    expect(convLabelList({})).toEqual([]);
  });

  it('isClosed', () => {
    expect(isClosed(c({ labels: ['bpc_cancelado'] }))).toBe(true);
    expect(isClosed(c({ labels: ['bpc_finalizado'] }))).toBe(false);
  });

  it('columnsByPriority nao muda a lista original', () => {
    const before = STATE_COLUMNS.map(x => x.key);
    const sorted = columnsByPriority();
    expect(sorted[0].key).toBe('fechado');
    expect(STATE_COLUMNS.map(x => x.key)).toEqual(before);
  });

  it('matchesColumn com tipo desconhecido e false', () => {
    expect(matchesColumn(c(), { kind: 'nada' })).toBe(false);
  });

  it.each([
    ['aberta sem resposta', {}, 'aberto'],
    [
      'respondida ha 1 dia',
      { first_reply_created_at: 1, last_activity_at: nowS - DAY },
      'atendimento_recente',
    ],
    [
      'respondida ha exatamente 2 dias',
      { first_reply_created_at: 1, last_activity_at: nowS - 2 * DAY },
      'atendimento_morno',
    ],
    [
      'respondida ha 6,9 dias',
      { first_reply_created_at: 1, last_activity_at: nowS - 6.9 * DAY },
      'atendimento_morno',
    ],
    [
      'respondida ha 7 dias',
      { first_reply_created_at: 1, last_activity_at: nowS - 7 * DAY },
      'atendimento_parado',
    ],
    [
      'respondida sem data',
      { first_reply_created_at: 1, last_activity_at: 0, timestamp: 0 },
      'atendimento_parado',
    ],
    ['pendente', { status: 'pending' }, 'aguardando'],
    ['adiada', { status: 'snoozed' }, 'aguardando'],
    ['resolvida', { status: 'resolved' }, 'resolvido'],
    [
      'desqualificada e resolvida (Fechado vence)',
      { status: 'resolved', labels: ['desqualificado'] },
      'fechado',
    ],
    [
      'desqualificada ainda aberta',
      { status: 'open', labels: ['trab_sem_direito'] },
      'fechado',
    ],
    ['status novo do Chatwoot', { status: 'arquivada' }, null],
  ])('%s -> %s', (_, over, key) => {
    expect(classify(c(over), STATE_COLUMNS, NOW)).toBe(key);
  });

  it('classifyAll separa por coluna e guarda as nao classificadas', () => {
    const list = [
      c({ id: 1 }),
      c({ id: 2, status: 'pending' }),
      c({ id: 3, status: 'pending' }),
      c({ id: 4, status: 'xyz' }),
    ];
    const { byKey, unclassified } = classifyAll(list, STATE_COLUMNS, NOW);
    expect(Object.keys(byKey).sort()).toEqual(
      STATE_COLUMNS.map(x => x.key).sort()
    );
    expect(byKey.aberto.map(x => x.id)).toEqual([1]);
    expect(byKey.aguardando.map(x => x.id)).toEqual([2, 3]);
    expect(unclassified.map(x => x.id)).toEqual([4]);
  });
});

describe('stateBoard — pessoas', () => {
  it('assigneeName e teamName', () => {
    expect(assigneeName(c({ meta: { assignee: { name: 'Ana' } } }))).toBe(
      'Ana'
    );
    expect(
      assigneeName(c({ meta: { assignee: { available_name: 'Bia' } } }))
    ).toBe('Bia');
    expect(assigneeName(c())).toBeNull();
    expect(teamName(c({ meta: { team: { name: 'SDR' } } }))).toBe('SDR');
    expect(teamName(c())).toBeNull();
  });

  it('attendantsFromMessages: so saida, so usuario, so depois do corte, sem repetir', () => {
    const msgs = [
      {
        message_type: 1,
        created_at: 10,
        sender: { type: 'user', name: 'Ana' },
      },
      {
        message_type: 1,
        created_at: 11,
        sender: { type: 'user', name: 'Ana' },
      },
      { message_type: 1, created_at: 12, sender: { name: 'Bia' } },
      {
        message_type: 1,
        created_at: 13,
        sender: { type: 'agent_bot', name: 'Robo' },
      },
      {
        message_type: 0,
        created_at: 14,
        sender: { type: 'contact', name: 'Cliente' },
      },
      {
        message_type: 1,
        created_at: 1,
        sender: { type: 'user', name: 'Velha' },
      },
      { message_type: 1, created_at: 15, sender: { type: 'user' } },
    ];
    expect(attendantsFromMessages(msgs, 5)).toEqual(['Ana', 'Bia']);
    expect(attendantsFromMessages(msgs)).toEqual(['Ana', 'Bia', 'Velha']);
    expect(attendantsFromMessages()).toEqual([]);
  });
});

describe('stateBoard — tabelas', () => {
  it('condensedKeyOf e condense', () => {
    expect(condensedKeyOf('atendimento_morno')).toBe('em_atendimento');
    expect(condensedKeyOf('fechado')).toBe('fechado');
    expect(condensedKeyOf('xyz')).toBeNull();
    expect(
      condense({
        aberto: 1,
        atendimento_recente: 2,
        atendimento_morno: 3,
        atendimento_parado: 4,
        resolvido: 5,
      })
    ).toEqual({
      aberto: 1,
      em_atendimento: 9,
      aguardando: 0,
      resolvido: 5,
      fechado: 0,
    });
  });

  it('buildTable: linhas por responsavel, TOTAL por conversa distinta', () => {
    const convs = [
      c({ id: 1, meta: { assignee: { name: 'Ana' } } }),
      c({ id: 2, meta: { assignee: { name: 'Ana' } }, status: 'resolved' }),
      c({ id: 3, meta: { assignee: { name: SHARED_ACCOUNT_NAME } } }),
      c({ id: 4 }),
      c({ id: 5, status: 'xyz' }),
    ];
    const t = buildTable(convs, { nowMs: NOW });
    expect(t.rows.map(r => r.name)).toEqual([
      SHARED_ACCOUNT_NAME,
      'Ana',
      UNASSIGNED_TITLE,
    ]);
    expect(t.total.total).toBe(4);
    expect(t.total.counts).toMatchObject({ aberto: 3, resolvido: 1 });
    expect(t.sharedRows).toBe(0);
  });

  it('buildTable: duas pessoas na mesma conversa -> linhas somam mais que o TOTAL', () => {
    const t = buildTable([c({ id: 1 }), c({ id: 2 })], {
      nowMs: NOW,
      rowFor: conv => (conv.id === 1 ? ['Ana', 'Bia'] : 'Ana'),
    });
    expect(t.total.total).toBe(2);
    expect(t.rows.find(r => r.name === 'Ana').total).toBe(2);
    expect(t.rows.find(r => r.name === 'Bia').total).toBe(1);
    expect(t.sharedRows).toBe(1);
  });

  it('buildTable: rowFor vazio vira "Nao atribuidas"', () => {
    const t = buildTable([c()], { nowMs: NOW, rowFor: () => [] });
    expect(t.rows.map(r => r.name)).toEqual([UNASSIGNED_TITLE]);
  });

  it('buildStateMatrix: semeia equipes/agentes cadastrados com zero', () => {
    const m = buildStateMatrix(
      [
        c({
          id: 1,
          meta: { assignee: { name: 'Ana' }, team: { name: 'SDR' } },
        }),
        c({ id: 2, meta: { assignee: { name: 'Ex-agente' } } }),
        c({ id: 3, status: 'pending' }),
      ],
      {
        nowMs: NOW,
        teams: [{ name: 'SDR' }, { name: 'Juridico' }, {}],
        agents: [{ name: 'Ana', email: 'ana@x' }, { name: 'Carla' }],
      }
    );
    expect(m.total.total).toBe(3);
    const [equipes, agentes] = m.groups;
    expect(equipes.rows[0]).toMatchObject({ name: NO_TEAM_TITLE, total: 2 });
    expect(equipes.rows.map(r => [r.name, r.total])).toEqual([
      [NO_TEAM_TITLE, 2],
      ['SDR', 1],
      ['Juridico', 0],
    ]);
    expect(agentes.rows.map(r => [r.name, r.total])).toEqual([
      [UNASSIGNED_TITLE, 1],
      ['Ana', 1],
      ['Ex-agente', 1],
      ['Carla', 0],
    ]);
    expect(agentes.rows.find(r => r.name === 'Ana').subtitle).toBe('ana@x');
    // Cada grupo e particao completa: soma das linhas = TOTAL.
    m.groups.forEach(g =>
      expect(g.rows.reduce((s, r) => s + r.total, 0)).toBe(m.total.total)
    );
  });
});
