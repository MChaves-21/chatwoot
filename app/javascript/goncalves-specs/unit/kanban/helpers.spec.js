/**
 * Kanban — funcoes puras (helpers.js).
 *
 * Bateria do fork Goncalves & Silva. Roda com TZ=UTC (script `test` do
 * package.json), entao as funcoes que usam o fuso local (dayStart, shiftYmd)
 * sao conferidas em UTC e as que fixam America/Sao_Paulo, em -03:00.
 */
import {
  activeFilterCount,
  buildPrevSummary,
  convAssignee,
  convCreatedMs,
  convCreatedRaw,
  convDisplayName,
  convLabels,
  convName,
  convPhone,
  convSender,
  convStageLabel,
  convText,
  convUpdatedMs,
  convUpdatedRaw,
  dateStrSP,
  dayEnd,
  dayStart,
  EMPTY_FILTERS,
  filtersActive,
  fmtBR,
  fmtDate,
  fmtPhoneBR,
  isoSP,
  isTrue,
  msgItems,
  msgsToArr,
  nextSteps,
  passesFilter,
  shiftYmd,
  situacaoBR,
  stageEmoji,
  suggestTags,
  toMs,
  trim1,
  ymdSP,
  ymdToBR,
} from 'dashboard/routes/dashboard/kanban/helpers';
import {
  AUXILIO_COLUMNS,
  BPC_COLUMNS,
  DEFAULT_TAGS,
  FUNNELS,
  TRABALHISTA_COLUMNS,
  UNSTAGED_LABEL,
} from 'dashboard/routes/dashboard/kanban/constants';

// 2026-10-26 15:00:00 UTC = 12:00 em Sao Paulo.
const T_1500_UTC = Date.UTC(2026, 9, 26, 15, 0, 0) / 1000;

const conv = (over = {}) => ({
  id: 10,
  status: 'open',
  labels: [],
  created_at: T_1500_UTC,
  last_activity_at: T_1500_UTC + 3600,
  unread_count: 0,
  meta: {
    sender: { name: 'Ercília Souza', phone_number: '+5585995270000' },
    assignee: { name: 'Karol' },
  },
  ...over,
});

const msg = (content, type = 0, at = T_1500_UTC) => ({
  content,
  message_type: type,
  created_at: at,
});

describe('kanban/helpers — primitivas', () => {
  it.each([
    [true, true],
    ['true', true],
    ['t', true],
    [1, true],
    ['1', true],
    [false, false],
    ['false', false],
    [0, false],
    ['0', false],
    [null, false],
    [undefined, false],
    ['sim', false],
  ])('isTrue(%p) = %p', (v, expected) => {
    expect(isTrue(v)).toBe(expected);
  });

  it('toMs converte epoch em segundos e texto ISO, e devolve null para lixo', () => {
    expect(toMs(1)).toBe(1000);
    expect(toMs('2026-10-26T15:00:00Z')).toBe(Date.UTC(2026, 9, 26, 15));
    expect(toMs(null)).toBeNull();
    expect(toMs(undefined)).toBeNull();
    expect(toMs('nao e data')).toBeNull();
  });

  it('trim1 junta espacos e corta com reticencias', () => {
    expect(trim1('  a\n\n b\t c  ')).toBe('a b c');
    expect(trim1('abcdef', 3)).toBe('abc...');
    expect(trim1('abc', 3)).toBe('abc');
    expect(trim1(null)).toBe('');
    expect(trim1('x'.repeat(200))).toHaveLength(183);
  });
});

describe('kanban/helpers — leitura da conversa', () => {
  it('le remetente, telefone, nome e responsavel', () => {
    const c = conv();
    expect(convSender(c).name).toBe('Ercília Souza');
    expect(convPhone(c)).toBe('+5585995270000');
    expect(convName(c)).toBe('Ercília Souza');
    expect(convAssignee(c)).toBe('Karol');
  });

  it('cai para telefone e depois para "Conversa #id" quando falta nome', () => {
    expect(convName(conv({ meta: { sender: { phone_number: '+55' } } }))).toBe(
      '+55'
    );
    expect(convName(conv({ meta: {} }))).toBe('Conversa #10');
    expect(convName({ id: 7 })).toBe('Conversa #7');
  });

  it('convDisplayName tira os til que o WhatsApp prefixa', () => {
    expect(
      convDisplayName(conv({ meta: { sender: { name: '~~Joao' } } }))
    ).toBe('Joao');
    expect(convDisplayName(conv({ meta: { sender: { name: 'A~B' } } }))).toBe(
      'A~B'
    );
  });

  it('nao quebra com conversa sem meta', () => {
    expect(convSender(null)).toEqual({});
    expect(convPhone({})).toBe('');
    expect(convAssignee({})).toBe('');
    expect(convLabels(null)).toEqual([]);
    expect(convLabels({ labels: 'sdr' })).toEqual([]);
  });

  it('datas: created_at > timestamp; last_activity_at > timestamp > created_at', () => {
    expect(convCreatedRaw({ created_at: 5, timestamp: 9 })).toBe(5);
    expect(convCreatedRaw({ timestamp: 9 })).toBe(9);
    expect(convCreatedRaw({ created_at: 0, timestamp: 9 })).toBe(0);
    expect(
      convUpdatedRaw({ last_activity_at: 3, timestamp: 9, created_at: 1 })
    ).toBe(3);
    expect(convUpdatedRaw({ timestamp: 9, created_at: 1 })).toBe(9);
    expect(convUpdatedRaw({ created_at: 1 })).toBe(1);
    expect(convCreatedMs({ created_at: 2 })).toBe(2000);
    expect(convUpdatedMs({})).toBeNull();
  });

  it('convStageLabel devolve a primeira etiqueta que e etapa do funil', () => {
    const stages = AUXILIO_COLUMNS.map(c => c.label);
    expect(
      convStageLabel(conv({ labels: ['urgente', 'comercial', 'sdr'] }), stages)
    ).toBe('comercial');
    expect(convStageLabel(conv({ labels: ['urgente'] }), stages)).toBeNull();
  });

  it.each([
    ['open', 'Em andamento'],
    ['pending', 'Pendente'],
    ['resolved', 'Resolvido'],
    ['snoozed', 'Adiado'],
    ['qualquer', 'Em andamento'],
    [undefined, 'Em andamento'],
  ])('situacaoBR(%p) = %p', (status, expected) => {
    expect(situacaoBR(status)).toBe(expected);
  });
});

describe('kanban/helpers — datas', () => {
  it('fmtDate formata dd/mm/aa hh:mm e aceita epoch ou ISO', () => {
    expect(fmtDate(T_1500_UTC)).toBe('26/10/26 15:00');
    expect(fmtDate('2026-01-02T03:04:00Z')).toBe('02/01/26 03:04');
    expect(fmtDate(null)).toBe('');
    expect(fmtDate('lixo')).toBe('');
  });

  it('fmtBR usa o fuso de Sao Paulo, nao o do navegador', () => {
    expect(fmtBR(T_1500_UTC)).toBe('26/10/2026 12:00');
    // 02:30 UTC ainda e o dia anterior em Sao Paulo.
    expect(fmtBR(Date.UTC(2026, 9, 27, 2, 30) / 1000)).toBe('26/10/2026 23:30');
    expect(fmtBR(undefined)).toBe('');
    expect(fmtBR('xx')).toBe('');
  });

  it('isoSP devolve ISO com -03:00 e milissegundos', () => {
    expect(isoSP(T_1500_UTC)).toBe('2026-10-26T12:00:00.000-03:00');
    expect(isoSP('2026-10-27T02:59:59.123Z')).toBe(
      '2026-10-26T23:59:59.123-03:00'
    );
    // Meia-noite em SP nao pode virar "24".
    expect(isoSP(Date.UTC(2026, 9, 27, 3, 0, 0) / 1000)).toBe(
      '2026-10-27T00:00:00.000-03:00'
    );
    expect(isoSP(null)).toBe('');
  });

  it('ymdSP / dateStrSP pegam o dia de Sao Paulo', () => {
    expect(ymdSP(new Date(Date.UTC(2026, 9, 27, 2, 0)))).toBe('2026-10-26');
    expect(ymdSP(new Date('lixo'))).toBe('');
    expect(dateStrSP(T_1500_UTC)).toBe('2026-10-26');
    expect(dateStrSP(null)).toBe('');
  });

  it.each([
    ['2026-10-31', 1, '2026-11-01'],
    ['2026-01-01', -1, '2025-12-31'],
    ['2028-02-28', 1, '2028-02-29'],
    ['2027-02-28', 1, '2027-03-01'],
    ['2026-03-15', -30, '2026-02-13'],
    ['2026-10-26', 0, '2026-10-26'],
  ])('shiftYmd(%s, %i) = %s', (ymd, delta, expected) => {
    expect(shiftYmd(ymd, delta)).toBe(expected);
  });

  it('ymdToBR inverte a data', () => {
    expect(ymdToBR('2026-10-26')).toBe('26/10/2026');
  });

  it('dayStart/dayEnd delimitam o dia e rejeitam texto invalido', () => {
    const s = dayStart('2026-10-26');
    const e = dayEnd('2026-10-26');
    expect(e - s).toBe(86399000);
    expect(dayStart('')).toBeNull();
    expect(dayEnd(null)).toBeNull();
    expect(dayStart('2026-13-45')).toBeNull();
  });
});

describe('kanban/helpers — telefone', () => {
  it.each([
    ['5585995270000', '(85) 99527-0000'],
    ['+55 (85) 99527-0000', '(85) 99527-0000'],
    ['85995270000', '(85) 99527-0000'],
    ['8532221100', '(85) 3222-1100'],
    ['558532221100', '(85) 3222-1100'],
    ['12345', '12345'],
    ['', ''],
    [null, ''],
  ])('fmtPhoneBR(%p) = %p', (raw, expected) => {
    expect(fmtPhoneBR(raw)).toBe(expected);
  });
});

describe('kanban/helpers — filtros', () => {
  const f = over => ({ ...EMPTY_FILTERS, ...over });

  it('EMPTY_FILTERS nao tem nada ativo', () => {
    expect(filtersActive(EMPTY_FILTERS)).toBe(false);
    expect(activeFilterCount(EMPTY_FILTERS)).toBe(0);
  });

  it('filtersActive liga com qualquer criterio', () => {
    ['q', 'tag', 'flag'].forEach(k => {
      expect(filtersActive(f({ [k]: 'x' }))).toBe(true);
    });
    ['cDe', 'cAte', 'aDe', 'aAte'].forEach(k => {
      expect(filtersActive(f({ [k]: 1 }))).toBe(true);
    });
    expect(filtersActive(f({ naoLidas: true }))).toBe(true);
  });

  it('activeFilterCount ignora a busca do topo e conta intervalo como 1', () => {
    expect(activeFilterCount(f({ q: 'joao' }))).toBe(0);
    expect(activeFilterCount(f({ cDe: 1, cAte: 2 }))).toBe(1);
    expect(
      activeFilterCount(
        f({ tag: 't', flag: 'SEGURADO', cDe: 1, aAte: 2, naoLidas: true })
      )
    ).toBe(5);
  });

  it('busca casa nome sem acento, mascara de telefone e #id', () => {
    const c = conv();
    expect(passesFilter(c, f({ q: 'ercilia' }))).toBe(true);
    expect(passesFilter(c, f({ q: 'ERCÍLIA' }))).toBe(true);
    expect(passesFilter(c, f({ q: '(85) 99527' }))).toBe(true);
    expect(passesFilter(c, f({ q: '#10' }))).toBe(true);
    expect(passesFilter(c, f({ q: 'maria' }))).toBe(false);
  });

  it('busca por telefone exige ao menos 4 digitos', () => {
    const c = conv({
      meta: { sender: { name: 'X', phone_number: '5585123' } },
    });
    expect(passesFilter(c, f({ q: '851' }))).toBe(true); // casa como texto
    expect(passesFilter(c, f({ q: '8-5-1-2' }))).toBe(true); // 4 digitos
    expect(passesFilter(c, f({ q: '9-9-9' }))).toBe(false);
  });

  it('tag exige a etiqueta na conversa', () => {
    const c = conv({ labels: ['urgente'] });
    expect(passesFilter(c, f({ tag: 'urgente' }))).toBe(true);
    expect(passesFilter(c, f({ tag: 'sem_advogado' }))).toBe(false);
  });

  it('periodo de criacao e de atualizacao sao inclusivos', () => {
    const c = conv();
    const created = T_1500_UTC * 1000;
    expect(passesFilter(c, f({ cDe: created, cAte: created }))).toBe(true);
    expect(passesFilter(c, f({ cDe: created + 1 }))).toBe(false);
    expect(passesFilter(c, f({ cAte: created - 1 }))).toBe(false);
    const updated = (T_1500_UTC + 3600) * 1000;
    expect(passesFilter(c, f({ aDe: updated }))).toBe(true);
    expect(passesFilter(c, f({ aAte: updated - 1 }))).toBe(false);
  });

  it('conversa sem data nao passa em filtro de data', () => {
    const c = { id: 1, labels: [] };
    expect(passesFilter(c, f({ cDe: 1 }))).toBe(false);
    expect(passesFilter(c, f({ aAte: 1 }))).toBe(false);
  });

  it('nao lidas', () => {
    expect(passesFilter(conv({ unread_count: 2 }), f({ naoLidas: true }))).toBe(
      true
    );
    expect(passesFilter(conv(), f({ naoLidas: true }))).toBe(false);
  });

  it('bandeira do lead le o cache por telefone', () => {
    const c = conv();
    const cache = { '+5585995270000': { SEGURADO: 't' } };
    expect(passesFilter(c, f({ flag: 'SEGURADO' }), cache)).toBe(true);
    expect(passesFilter(c, f({ flag: 'Contrato_assinado' }), cache)).toBe(
      false
    );
    expect(passesFilter(c, f({ flag: 'SEGURADO' }), {})).toBe(false);
  });

  it('criterios combinados sao E logico', () => {
    const c = conv({ labels: ['urgente'], unread_count: 1 });
    expect(
      passesFilter(c, f({ q: 'ercilia', tag: 'urgente', naoLidas: true }))
    ).toBe(true);
    expect(
      passesFilter(c, f({ q: 'ercilia', tag: 'outra', naoLidas: true }))
    ).toBe(false);
  });
});

describe('kanban/helpers — mensagens', () => {
  const msgs = {
    payload: [
      msg('Oi'),
      msg('  '),
      msg('Bom dia, posso ajudar?', 1),
      msg('Fulano adicionou sdr', 2),
      msg(null),
      msg('nota', 3),
    ],
  };

  it('msgItems fica so com entrada/saida com texto', () => {
    expect(msgItems(msgs).map(m => m.content)).toEqual([
      'Oi',
      'Bom dia, posso ajudar?',
    ]);
    expect(msgItems(msgs.payload)).toHaveLength(2);
    expect(msgItems(null)).toEqual([]);
  });

  it('msgsToArr marca quem falou', () => {
    expect(msgsToArr(msgs)).toEqual([
      { who: 'cliente', content: 'Oi', at: T_1500_UTC },
      { who: 'atendente', content: 'Bom dia, posso ajudar?', at: T_1500_UTC },
    ]);
  });

  it('convText junta em minusculas', () => {
    expect(convText(msgs)).toBe('oi bom dia, posso ajudar?');
  });
});

describe('kanban/helpers — suggestTags', () => {
  const run = (texts, { labels = [], lead = null } = {}) =>
    suggestTags(
      conv({ labels }),
      lead,
      texts.map(t => msg(t)),
      DEFAULT_TAGS
    ).sort();

  it('detecta cada tag pela conversa', () => {
    expect(run(['Recebo o beneficio do INSS'])).toContain(
      'recebendo_beneficio'
    );
    expect(run(['nao tenho advogado'])).toEqual(['sem_advogado']);
    expect(run(['meu advogado disse'])).toEqual(['ja_tem_advogado']);
    expect(run(['sofri um acidente na empresa'])).toEqual([
      'acidente_trabalho',
    ]);
    expect(run(['tenho laudo'])).toEqual(['tem_laudo_medico']);
    expect(run(['o auxilio foi negado'])).toContain('auxilio_negado');
    expect(run(['a pericia foi marcada'])).toEqual(['pericia_agendada']);
    expect(run(['pago carne do inss'])).toEqual(['contribuinte_inss']);
    expect(run(['falta enviar documento'])).toEqual(['documentos_pendentes']);
    expect(run(['e urgente'])).toEqual(['urgente']);
  });

  it('lead SEGURADO do Supabase basta para recebendo_beneficio', () => {
    expect(run(['ola'], { lead: { SEGURADO: 'true' } })).toEqual([
      'recebendo_beneficio',
    ]);
  });

  it('nao sugere tag que ja esta aplicada nem tag fora da lista', () => {
    expect(run(['e urgente'], { labels: ['urgente'] })).toEqual([]);
    expect(
      suggestTags(conv(), null, [msg('e urgente')], [{ label: 'outra' }])
    ).toEqual([]);
  });

  it('sem advogado vence ja tem advogado (nao sugere os dois)', () => {
    const out = run(['nao tenho advogado, meu primo e advogado']);
    expect(out).toContain('sem_advogado');
    expect(out).not.toContain('ja_tem_advogado');
  });

  it('conversa vazia nao sugere nada', () => {
    expect(run([])).toEqual([]);
  });
});

describe('kanban/helpers — proximo passo e emoji por etapa', () => {
  const allColumns = [
    ...AUXILIO_COLUMNS,
    ...BPC_COLUMNS,
    ...TRABALHISTA_COLUMNS,
  ];
  const uniqueLabels = [...new Set(allColumns.map(c => c.label))];

  /*
   * Achados de 04/11/2026: colunas que existem no quadro mas nao tem texto de
   * "Proximo passo" ou emoji. Ficam listadas aqui para o teste pegar coluna
   * NOVA sem texto; quando o texto entrar, tire o item da lista.
   */
  const SEM_PROXIMO_PASSO = ['bpc_finalizado'];
  const SEM_EMOJI = ['reprovado_dr_gerardo', 'aprovado_repescagem'];

  it.each(uniqueLabels.filter(l => !SEM_PROXIMO_PASSO.includes(l)))(
    'coluna %s tem proximo passo',
    label => {
      expect(nextSteps(label)).not.toBe('');
    }
  );

  it.each(uniqueLabels.filter(l => !SEM_EMOJI.includes(l)))(
    'coluna %s tem emoji',
    label => {
      expect(stageEmoji(label)).not.toBe('');
    }
  );

  it('lista de pendencias continua valida (se falhar, a coluna ganhou texto: tire da lista)', () => {
    SEM_PROXIMO_PASSO.forEach(l => expect(nextSteps(l)).toBe(''));
    SEM_EMOJI.forEach(l => expect(stageEmoji(l)).toBe(''));
  });

  it('cancelado e desqualificado do BPC tem textos diferentes', () => {
    expect(nextSteps('bpc_cancelado')).not.toBe(
      nextSteps('bpc_desqualificado')
    );
    expect(nextSteps('bpc_cancelado')).toMatch(/desistiu/);
    expect(nextSteps('bpc_desqualificado')).toMatch(/requisito/);
  });

  it('etiqueta desconhecida nao tem texto nem emoji', () => {
    expect(nextSteps('xyz')).toBe('');
    expect(stageEmoji('xyz')).toBe('');
    expect(nextSteps(undefined)).toBe('');
  });

  it('"Sem etapa" tem instrucao de classificar', () => {
    expect(nextSteps(UNSTAGED_LABEL)).toMatch(/classificar/);
    expect(stageEmoji(UNSTAGED_LABEL)).toBe('❓');
  });
});

describe('kanban/helpers — buildPrevSummary (ficha do lead)', () => {
  const columns = FUNNELS[0].columns;
  const summary = (texts, { labels = ['comercial'], lead = null } = {}) => {
    const c = conv({ labels, status: 'open' });
    return buildPrevSummary({
      conv: c,
      full: c,
      lead,
      msgs: texts.map((t, i) => msg(t, 0, T_1500_UTC + i * 60)),
      columns,
      tags: DEFAULT_TAGS,
    });
  };

  it('extrai ano, mes, profissao, como aconteceu e sequela', () => {
    const out = summary([
      'Eu trabalhava como pedreiro.',
      'Em março de 2023 sofri um acidente, caí da escada na obra.',
      'Fiquei com dificuldade de movimento no braço.',
      'Era de carteira assinada.',
      'Recebi auxílio-doença por 3 meses.',
      'Tenho laudo e raio-x.',
      'Não tenho advogado.',
    ]);
    expect(out).toContain('📅 Ano do acidente: 2023');
    expect(out).toContain('📅 Mês do acidente: Março');
    expect(out).toContain('👷 Profissão na época: Pedreiro');
    expect(out).toContain(
      '📍 Como aconteceu: Em março de 2023 sofri um acidente, caí da escada na obra.'
    );
    expect(out).toContain('💥 Sequela/limitação: Sim - Fiquei com dificuldade');
    expect(out).toContain('💼 Situação na época: Com carteira assinada (CLT)');
    expect(out).toContain('🩺 Recebeu auxílio-doença: Sim');
    expect(out).toContain('📄 Tem documentos médicos: Sim');
    expect(out).toContain('⚖️ Tem advogado na causa: Não');
    expect(out).toContain('📌 Status: Comercial');
    expect(out).toContain('Responsável: Karol');
    expect(out).toContain('Próximo passo: Apresentar proposta');
  });

  it('negacao perto do termo vira "Não"', () => {
    const out = summary(['Nunca recebi auxilio doença']);
    expect(out).toContain('🩺 Recebeu auxílio-doença: Não');
  });

  it('o que nao foi dito vira problema listado', () => {
    const out = summary(['Oi, quero saber do beneficio']);
    expect(out).toContain('⚠️ PROBLEMAS IDENTIFICADOS:');
    expect(out).toContain('- Não informado o ano do acidente');
    expect(out).toContain('- Pergunta sobre auxílio-doença não foi feita');
    expect(out).toContain('- Pergunta sobre advogado não foi feita');
    expect(out).toContain('- Não informado se recebeu seguro-desemprego');
  });

  it('ano no futuro ou antes de 1980 e ignorado', () => {
    const futuro = new Date().getFullYear() + 2;
    const out = summary([`O acidente foi em ${futuro}`, 'ou em 1975']);
    expect(out).toContain('📅 Ano do acidente: Não informado');
  });

  it('desqualificado mostra o motivo e o status', () => {
    const out = summary(['Eu não tinha carteira assinada na época'], {
      labels: ['desqualificado'],
    });
    expect(out).toContain('🚫 MOTIVO DA DESQUALIFICAÇÃO:');
    expect(out).toContain('Sem registro em carteira (CLT)');
    expect(out).toContain('📌 Status: ❌ DESQUALIFICADO');
  });

  it('desqualificado sem motivo na conversa pede para confirmar', () => {
    const out = summary(['ok'], { labels: ['descarte_sdr'] });
    expect(out).toContain('Não registrado na conversa');
  });

  it('efetivado tem status proprio', () => {
    expect(summary(['ok'], { labels: ['efetivado'] })).toContain(
      '📌 Status: ✅ EFETIVADO'
    );
  });

  it('rodape lista tags e bandeiras do lead', () => {
    const out = summary(['ok'], {
      labels: ['comercial', 'urgente'],
      lead: { SEGURADO: 't', Contrato_enviado: '1' },
    });
    expect(out).toContain('Tags: Urgente');
    expect(out).toContain('Lead (Supabase): Segurado, Contrato enviado');
  });

  it('sem etapa mostra "-" e sem mensagens nao quebra', () => {
    const c = conv({ labels: [] });
    const out = buildPrevSummary({
      conv: c,
      full: c,
      lead: null,
      msgs: [],
      columns,
      tags: [],
    });
    expect(out).toContain('📌 Status: -');
    expect(out).toContain('Mensagens: 0');
  });

  it('usa as etiquetas de `full` quando o card vivo nao tem nenhuma', () => {
    const live = conv({ labels: [] });
    const full = conv({ labels: ['sdr'] });
    const out = buildPrevSummary({
      conv: live,
      full,
      lead: null,
      msgs: [msg('ok')],
      columns,
      tags: [],
    });
    expect(out).toContain('📌 Status: SDR');
  });
});
