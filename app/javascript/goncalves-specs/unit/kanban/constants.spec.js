/**
 * Kanban — invariantes dos funis (constants.js e stateConstants.js).
 *
 * Cada teste aqui corresponde a um defeito que ja aconteceu ou que a
 * documentacao do fork diz que nao pode acontecer (ver comentarios em
 * constants.js): etiqueta de descarte sem coluna, funil com a caixa errada,
 * conta parceira vendo funil da Goncalves, coluna duplicada.
 */
import {
  AUXILIO_COLUMNS,
  BPC_COLUMNS,
  BPC_FUNNEL_ID,
  COLUMN_CONCURRENCY,
  DEFAULT_FUNNEL_ID,
  DEFAULT_PREFS,
  DEFAULT_TAGS,
  DISQUALIFIED_LABELS,
  findFunnel,
  FP_ACCOUNT_ID,
  FP_FUNNEL_ID,
  FP_INBOX_ID,
  FUNNELS,
  HOME_ACCOUNT_ID,
  IMPORTED_LABELS,
  kanbanFunnelsForAccount,
  LAWCHAT_FUNNEL_ID,
  LAWCHAT_INBOX_ID,
  LEAD_FLAGS,
  LS_KEY,
  MANUAL_LABEL,
  MAX_PAGES_PER_COLUMN,
  NO_AUTOMATION_LABEL,
  PARTNER_FUNNELS,
  PARTNER_INBOX_IDS,
  SCHEDULE_WEBHOOK_URL,
  STAGE_EMOJI,
  STATUS_LABELS,
  TRABALHISTA_COLUMNS,
  TRABALHISTA_FUNNEL_ID,
  TRABALHISTA_INBOX_ID,
  UNSTAGED_LABEL,
} from 'dashboard/routes/dashboard/kanban/constants';
import {
  CLOSED_LABELS,
  DEFAULT_STATE_SCOPE,
  INBOX_NAMES,
  MATRIX_CELL_COLORS,
  STATE_COLUMNS,
  STATE_INBOX_IDS,
  STATE_SCOPES,
  TABLE_COLUMNS,
} from 'dashboard/routes/dashboard/kanban/stateConstants';

const HEX = /^#[0-9a-f]{6}$/i;
const LABEL = /^[a-z0-9_]+$/;
const allPartnerFunnels = Object.values(PARTNER_FUNNELS).flat();
const allFunnels = [...FUNNELS, ...allPartnerFunnels];

describe('kanban/constants — colunas', () => {
  describe.each([
    ['Auxilio', AUXILIO_COLUMNS],
    ['BPC', BPC_COLUMNS],
    ['Trabalhista', TRABALHISTA_COLUMNS],
  ])('%s', (_, columns) => {
    it('tem titulo, etiqueta e cor validos', () => {
      columns.forEach(c => {
        expect(c.title).toBeTruthy();
        expect(c.color).toMatch(HEX);
        if (c.label !== UNSTAGED_LABEL) expect(c.label).toMatch(LABEL);
      });
    });

    it('nao repete etiqueta nem titulo', () => {
      const labels = columns.map(c => c.label);
      const titles = columns.map(c => c.title);
      expect(new Set(labels).size).toBe(labels.length);
      expect(new Set(titles).size).toBe(titles.length);
    });

    it('"Sem etapa", se existir, e a primeira coluna', () => {
      const i = columns.findIndex(c => c.label === UNSTAGED_LABEL);
      expect([-1, 0]).toContain(i);
    });
  });

  it('Auxilio e BPC tem "Sem etapa" (26/10/2026); Trabalhista nao', () => {
    expect(AUXILIO_COLUMNS[0].label).toBe(UNSTAGED_LABEL);
    expect(BPC_COLUMNS[0].label).toBe(UNSTAGED_LABEL);
    expect(TRABALHISTA_COLUMNS.some(c => c.label === UNSTAGED_LABEL)).toBe(
      false
    );
  });

  it('BPC usa prefixo bpc_ e Trabalhista usa trab_ (moveToStage depende disso)', () => {
    BPC_COLUMNS.filter(c => c.label !== UNSTAGED_LABEL).forEach(c =>
      expect(c.label.startsWith('bpc_')).toBe(true)
    );
    TRABALHISTA_COLUMNS.forEach(c =>
      expect(c.label.startsWith('trab_')).toBe(true)
    );
  });

  it('nenhuma etapa do Auxilio colide com etapa do BPC ou do Trabalhista', () => {
    const aux = new Set(AUXILIO_COLUMNS.map(c => c.label));
    [...BPC_COLUMNS, ...TRABALHISTA_COLUMNS]
      .filter(c => c.label !== UNSTAGED_LABEL)
      .forEach(c => expect(aux.has(c.label)).toBe(false));
  });

  it('colunas fundidas nao voltaram (contrato_enviado, lead_potencial)', () => {
    const labels = AUXILIO_COLUMNS.map(c => c.label);
    expect(labels).not.toContain('contrato_enviado');
    expect(labels).not.toContain('lead_potencial');
  });

  it('colunas de origem do ChatGuru sairam do BPC (15/09/2026)', () => {
    const labels = BPC_COLUMNS.map(c => c.label);
    expect(labels).not.toContain('chatguru_closer');
    expect(labels).not.toContain('chatguru_sdr');
  });

  it('Dr. Gerardo e repescagem ficam entre a analise medica e a juridica', () => {
    const labels = AUXILIO_COLUMNS.map(c => c.label);
    const med = labels.indexOf('analise_medica');
    const jur = labels.indexOf('analise_juridica');
    expect(labels.indexOf('reprovado_dr_gerardo')).toBe(med + 1);
    expect(labels.indexOf('aprovado_repescagem')).toBe(med + 2);
    expect(jur).toBe(med + 3);
  });

  it('"Lead novo especial" vem logo depois de "Lead novo" no BPC', () => {
    const labels = BPC_COLUMNS.map(c => c.label);
    expect(labels.indexOf('bpc_lead_novo_especial')).toBe(
      labels.indexOf('bpc_lead_novo') + 1
    );
  });
});

describe('kanban/constants — descarte (fonte unica)', () => {
  it('DISQUALIFIED_LABELS e a MESMA lista que CLOSED_LABELS', () => {
    expect(DISQUALIFIED_LABELS).toBe(CLOSED_LABELS);
  });

  it('toda etiqueta de descarte tem coluna em algum funil (bug do BPC)', () => {
    const declared = new Set(
      allFunnels.flatMap(f => f.columns.map(c => c.label))
    );
    CLOSED_LABELS.forEach(l => expect(declared.has(l)).toBe(true));
  });

  it('colunas de espera NAO sao descarte', () => {
    ['bpc_finalizado', 'reprovado_dr_gerardo', 'aguardando_tempo'].forEach(l =>
      expect(CLOSED_LABELS).not.toContain(l)
    );
  });

  it('efetivado nao e descarte', () => {
    expect(CLOSED_LABELS).not.toContain('efetivado');
    expect(CLOSED_LABELS).not.toContain('bpc_efetivado');
  });

  it('cada funil de descarte tem as suas etiquetas', () => {
    expect(CLOSED_LABELS).toEqual(
      expect.arrayContaining([
        'desqualificado',
        'descarte_sdr',
        'bpc_desqualificado',
        'bpc_cancelado',
        'bpc_fechado_sem_resposta',
        'trab_prescrito',
        'trab_sem_direito',
        'trab_desinteresse',
      ])
    );
  });
});

describe('kanban/constants — funis por conta', () => {
  it('funis da Goncalves: ids e caixas unicos e conhecidos', () => {
    const ids = FUNNELS.map(f => f.id);
    const inboxes = FUNNELS.map(f => f.inboxId);
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(inboxes).size).toBe(inboxes.length);
    expect(Object.fromEntries(FUNNELS.map(f => [f.id, f.inboxId]))).toEqual({
      auxilio_acidente: 6,
      [LAWCHAT_FUNNEL_ID]: LAWCHAT_INBOX_ID,
      [BPC_FUNNEL_ID]: 15,
      [TRABALHISTA_FUNNEL_ID]: TRABALHISTA_INBOX_ID,
    });
  });

  it('todo funil tem caixa (sem ela o quadro mistura caixas)', () => {
    allFunnels.forEach(f => expect(Number.isInteger(f.inboxId)).toBe(true));
  });

  it('o 0300 usa as colunas do Auxilio e so ele esconde importados', () => {
    const f0300 = FUNNELS.find(f => f.id === LAWCHAT_FUNNEL_ID);
    expect(f0300.columns).toBe(AUXILIO_COLUMNS);
    expect(f0300.canHideImported).toBe(true);
    FUNNELS.filter(f => f.id !== LAWCHAT_FUNNEL_ID).forEach(f =>
      expect(f.canHideImported).toBeFalsy()
    );
    expect(IMPORTED_LABELS).toEqual(['origem_lawchat', 'importado']);
  });

  it('o quadro "Por estado" saiu do seletor (30/10/2026)', () => {
    expect(FUNNELS.some(f => f.id === 'por_estado')).toBe(false);
  });

  it('Ferreira & Paiva (conta 3) ve so o funil dela, na caixa 16', () => {
    const list = kanbanFunnelsForAccount(FP_ACCOUNT_ID);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ id: FP_FUNNEL_ID, inboxId: FP_INBOX_ID });
    expect(kanbanFunnelsForAccount('3')).toBe(list);
  });

  it('F&P para em contrato assinado e nao tem "Sem etapa"', () => {
    const labels = kanbanFunnelsForAccount(3)[0].columns.map(c => c.label);
    expect(labels).toEqual([
      'sdr',
      'comercial',
      'contrato_em_elaboracao',
      'aguardando_assinatura',
      'contrato_assinado',
      'desqualificado',
    ]);
  });

  it('conta 1 e conta desconhecida veem os funis da Goncalves', () => {
    expect(kanbanFunnelsForAccount(HOME_ACCOUNT_ID)).toBe(FUNNELS);
    expect(kanbanFunnelsForAccount(99)).toBe(FUNNELS);
    expect(kanbanFunnelsForAccount(undefined)).toBe(FUNNELS);
  });

  it('PARTNER_INBOX_IDS lista as caixas das parceiras', () => {
    expect(PARTNER_INBOX_IDS).toEqual([FP_INBOX_ID]);
  });

  it('findFunnel acha pelo id e cai no primeiro funil da conta', () => {
    expect(findFunnel(BPC_FUNNEL_ID, 1).id).toBe(BPC_FUNNEL_ID);
    expect(findFunnel('nao_existe', 1).id).toBe(DEFAULT_FUNNEL_ID);
    // Preferencia salva com funil da Goncalves numa conta parceira.
    expect(findFunnel(BPC_FUNNEL_ID, 3).id).toBe(FP_FUNNEL_ID);
    expect(DEFAULT_FUNNEL_ID).toBe('auxilio_acidente');
  });
});

describe('kanban/constants — preferencias e diversos', () => {
  it('DEFAULT_PREFS nao guarda colunas (sao preset no codigo)', () => {
    expect(DEFAULT_PREFS).not.toHaveProperty('columns');
    expect(DEFAULT_PREFS).toMatchObject({
      funnelId: DEFAULT_FUNNEL_ID,
      status: 'all',
      hideImported: false,
    });
    expect(LS_KEY).toBe('cw_kanban_prefs_v5');
  });

  it('tags padrao tem etiqueta valida e cor', () => {
    DEFAULT_TAGS.forEach(t => {
      expect(t.label).toMatch(LABEL);
      expect(t.color).toMatch(HEX);
    });
  });

  it('etiquetas de controle', () => {
    expect(MANUAL_LABEL).toBe('manual');
    expect(NO_AUTOMATION_LABEL).toBe('atendimento_humanizado');
    expect(UNSTAGED_LABEL).toBe('__sem_etapa__');
  });

  it('limites de carga protegem o Puma (5 slots)', () => {
    expect(COLUMN_CONCURRENCY).toBeLessThanOrEqual(3);
    expect(MAX_PAGES_PER_COLUMN).toBeGreaterThan(0);
  });

  it('webhook do Agendar e https do n8n da Goncalves', () => {
    expect(SCHEDULE_WEBHOOK_URL).toMatch(
      /^https:\/\/n8n\.goncalvesesilva\.cloud\/webhook\//
    );
  });

  it('STATUS_LABELS cobre os 4 status do Chatwoot', () => {
    expect(Object.keys(STATUS_LABELS).sort()).toEqual(
      ['open', 'pending', 'resolved', 'snoozed'].sort()
    );
  });

  it('LEAD_FLAGS tem chaves unicas', () => {
    const keys = LEAD_FLAGS.map(f => f.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('STAGE_EMOJI nao tem chave de etapa inexistente (exceto as aposentadas)', () => {
    const known = new Set([
      ...allFunnels.flatMap(f => f.columns.map(c => c.label)),
      'lead_potencial',
      'contrato_enviado',
    ]);
    Object.keys(STAGE_EMOJI).forEach(k => expect(known.has(k)).toBe(true));
  });
});

describe('kanban/stateConstants — quadro por estado', () => {
  it('as caixas do quadro sao Auxilio (6) e BPC (15)', () => {
    expect(STATE_INBOX_IDS).toEqual([6, 15]);
    STATE_INBOX_IDS.forEach(id => expect(INBOX_NAMES[id]).toBeTruthy());
  });

  it('prioridades sao unicas e Fechado vence Resolvido', () => {
    const p = STATE_COLUMNS.map(c => c.priority);
    expect(new Set(p).size).toBe(p.length);
    const byKey = Object.fromEntries(STATE_COLUMNS.map(c => [c.key, c]));
    expect(byKey.fechado.priority).toBeLessThan(byKey.resolvido.priority);
    expect(byKey.fechado.labels).toBe(CLOSED_LABELS);
  });

  it('faixas de "Em atendimento" encaixam sem buraco (0-2, 2-7, 7+)', () => {
    const faixas = STATE_COLUMNS.filter(c => c.kind === 'openReplied');
    expect(
      faixas.map(c => [c.minIdleDays ?? 0, c.maxIdleDays ?? null])
    ).toEqual([
      [0, 2],
      [2, 7],
      [7, null],
    ]);
  });

  it('TABLE_COLUMNS condensa todas as colunas detalhadas uma vez so', () => {
    const from = TABLE_COLUMNS.flatMap(t => t.from).sort();
    expect(from).toEqual(STATE_COLUMNS.map(c => c.key).sort());
    TABLE_COLUMNS.forEach(t => expect(MATRIX_CELL_COLORS[t.key]).toMatch(HEX));
  });

  it('recortes de periodo', () => {
    expect(STATE_SCOPES.map(s => s.days)).toEqual([1, 7, 30, null]);
    expect(STATE_SCOPES.some(s => s.key === DEFAULT_STATE_SCOPE)).toBe(true);
  });
});
