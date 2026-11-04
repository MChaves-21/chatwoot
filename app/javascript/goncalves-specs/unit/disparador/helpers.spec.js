/**
 * Disparador — funcoes puras (helpers.js) e constantes.
 */
import {
  buildRecipients,
  canonicalPhone,
  conversationOptions,
  estimateEnd,
  firstName,
  formatDateTime,
  formatPhone,
  phoneSearchKey,
  progressOf,
  renderTemplate,
  renderText,
  samePhone,
  templateMessageBody,
  toCsv,
  usableTemplates,
} from 'dashboard/routes/dashboard/disparador/helpers';
import {
  DEFAULT_CONFIG,
  DEFAULT_EXCLUDE,
  DISPARADOR_URL,
  MAX_RECIPIENTS,
  PACES,
  SINGLE_CONFIG,
  WEEKDAYS,
  WINDOWS,
} from 'dashboard/routes/dashboard/disparador/constants';
import { CLOSED_LABELS } from 'dashboard/routes/dashboard/kanban/stateConstants';

// Hora de Fortaleza (UTC-3) em ms.
const fz = (y, m, d, h, min = 0) => Date.UTC(y, m - 1, d, h + 3, min);

describe('disparador — publico', () => {
  const conv = (id, contactId, over = {}) => ({
    id,
    labels: [],
    last_activity_at: id,
    meta: {
      sender: { id: contactId, name: ` Ana ${id} `, phone_number: `+55${id}` },
    },
    ...over,
  });

  it('um envio por contato (a conversa mais recente), barra descartes e sem contato', () => {
    const out = buildRecipients(
      [
        conv(1, 10),
        conv(5, 10),
        conv(3, 10),
        conv(2, 20, { labels: ['desqualificado'] }),
        conv(4, 0),
        conv(6, 30, { last_activity_at: undefined, timestamp: 9 }),
      ],
      { exclude: DEFAULT_EXCLUDE }
    );
    expect(out.recipients).toEqual([
      { conversation_id: 5, contact_id: 10, nome: 'Ana 5', telefone: '+555' },
      { conversation_id: 6, contact_id: 30, nome: 'Ana 6', telefone: '+556' },
    ]);
    expect(out).toMatchObject({ excluidas: 1, semContato: 1, duplicadas: 2 });
  });

  it('sem exclusao e lista vazia', () => {
    expect(buildRecipients([])).toEqual({
      recipients: [],
      excluidas: 0,
      semContato: 0,
      duplicadas: 0,
    });
  });

  it('exclusao padrao = descartes do escritorio (copia, nao a mesma lista)', () => {
    expect(DEFAULT_EXCLUDE).toEqual(CLOSED_LABELS);
    expect(DEFAULT_EXCLUDE).not.toBe(CLOSED_LABELS);
  });
});

describe('disparador — texto', () => {
  it.each([
    ['~maria DA silva', 'Maria'],
    ['JOSÉ', 'José'],
    ['  ', ''],
    [null, ''],
  ])('firstName(%p) = %p', (nome, esperado) => {
    expect(firstName(nome)).toBe(esperado);
  });

  it('renderText troca so as variaveis conhecidas', () => {
    expect(
      renderText('Olá {{ primeiro_nome }}, {{nome}}! {{outro}}', '~JOSÉ silva')
    ).toBe('Olá José, JOSÉ silva! {{outro}}');
    expect(renderText('Oi {{nome}}', '')).toBe('Oi ');
    expect(renderText(null, 'x')).toBe('');
  });

  it('usableTemplates: so aprovados e sem cabecalho de midia', () => {
    const list = usableTemplates([
      {
        name: 'boas_vindas',
        language: 'pt_BR',
        category: 'MARKETING',
        status: 'APPROVED',
        components: [
          { type: 'HEADER', format: 'TEXT', text: 'Oi' },
          { type: 'BODY', text: 'Olá {{2}} e {{1}} e {{ 1 }}' },
        ],
      },
      { name: 'rascunho', status: 'PENDING', components: [] },
      {
        name: 'com_imagem',
        status: 'approved',
        components: [
          { type: 'HEADER', format: 'IMAGE' },
          { type: 'BODY', text: 'x' },
        ],
      },
      { name: 'sem_corpo', language: 'pt_BR', status: 'approved' },
    ]);
    expect(list.map(t => t.name)).toEqual(['boas_vindas', 'sem_corpo']);
    expect(list[0]).toMatchObject({
      key: 'boas_vindas|pt_BR',
      params: ['1', '2'],
      namespace: '',
      mediaHeader: false,
    });
    expect(list[1]).toMatchObject({ body_text: '', params: [] });
    expect(usableTemplates(null)).toEqual([]);
  });

  it('renderTemplate preenche {{n}} e as variaveis dentro do parametro', () => {
    expect(
      renderTemplate(
        'Oi {{1}}, sua consulta e {{2}}. {{1}}! {{3}}',
        { 1: '{{primeiro_nome}}', 2: 'amanhã' },
        'ana maria'
      )
    ).toBe('Oi Ana, sua consulta e amanhã. Ana! ');
  });

  it('templateMessageBody no formato do Chatwoot', () => {
    const t = {
      name: 'aviso',
      category: 'UTILITY',
      language: 'pt_BR',
      namespace: '',
      body_text: 'Olá {{1}}',
    };
    expect(templateMessageBody(t, { 1: '{{nome}}' }, '~Ana Lima')).toEqual({
      content: 'Olá Ana Lima',
      message_type: 'outgoing',
      template_params: {
        name: 'aviso',
        category: 'UTILITY',
        language: 'pt_BR',
        processed_params: { body: { 1: 'Ana Lima' } },
      },
    });
    expect(
      templateMessageBody({ ...t, namespace: 'ns' }, {}, 'x').template_params
        .namespace
    ).toBe('ns');
  });
});

describe('disparador — telefone', () => {
  it.each([
    ['85 99855-2131', '558598552131'],
    ['+55 (85) 9855-2131', '558598552131'],
    ['5585998552131', '558598552131'],
    ['085998552131', '558598552131'],
    ['(85) 3222-1100', '558532221100'],
    ['+1 202 555 0123', ''],
    ['123', ''],
    ['', ''],
    [null, ''],
  ])('canonicalPhone(%p) = %p', (v, esperado) => {
    expect(canonicalPhone(v)).toBe(esperado);
  });

  it('samePhone casa com e sem o nono digito (API oficial x uazapi)', () => {
    expect(samePhone('5585998552131', '558598552131')).toBe(true);
    expect(samePhone('85998552131', '+55 85 9855-2131')).toBe(true);
    expect(samePhone('85998552131', '85998552132')).toBe(false);
    expect(samePhone('', '')).toBe(false);
  });

  it('phoneSearchKey: 8 ultimos digitos da forma canonica', () => {
    expect(phoneSearchKey('5585998552131')).toBe('98552131');
    expect(phoneSearchKey('lixo')).toBe('');
  });

  it('formatPhone de celular', () => {
    expect(formatPhone('558598552131')).toBe('(85) 99855-2131');
    expect(formatPhone('abc')).toBe('abc');
    expect(formatPhone(null)).toBe('');
  });

  // Achado 04/11/2026: telefone FIXO ganha um 9 na exibicao ("(85) 93222-1100").
  // Quando for corrigido, este teste passa a falhar: troque `it.fails` por `it`.
  it.fails('formatPhone de telefone fixo nao ganha o 9 (achado)', () => {
    expect(formatPhone('(85) 3222-1100')).toBe('(85) 3222-1100');
  });
});

describe('disparador — estimativa de termino', () => {
  const cfg = { ...DEFAULT_CONFIG };

  it('dentro da janela comeca na hora', () => {
    const start = fz(2026, 11, 4, 10); // quarta 10h
    const r = estimateEnd(3, cfg, start);
    expect(r.first).toBe(start);
    expect(r.last).toBe(start + 2 * 65000);
  });

  it('antes da janela espera ate a abertura do mesmo dia', () => {
    const r = estimateEnd(1, cfg, fz(2026, 11, 4, 7));
    expect(r.first).toBe(fz(2026, 11, 4, 9));
  });

  it('depois da janela vai para o dia util seguinte', () => {
    expect(estimateEnd(1, cfg, fz(2026, 11, 4, 18)).first).toBe(
      fz(2026, 11, 5, 9)
    );
    // sexta a noite -> segunda
    expect(estimateEnd(1, cfg, fz(2026, 11, 6, 19)).first).toBe(
      fz(2026, 11, 9, 9)
    );
  });

  it('fim de semana pula para segunda', () => {
    expect(estimateEnd(1, cfg, fz(2026, 11, 7, 10)).first).toBe(
      fz(2026, 11, 9, 9)
    );
  });

  it('domingo vale quando a janela inclui o dia 7', () => {
    const todos = { ...cfg, ...WINDOWS[1].config };
    const dom = fz(2026, 11, 8, 10);
    expect(estimateEnd(1, todos, dom).first).toBe(dom);
  });

  it('pausa a cada N envios', () => {
    const c = {
      ...cfg,
      intervalo_min: 60,
      intervalo_max: 60,
      pausa_a_cada: 2,
      pausa_minutos: 10,
    };
    const start = fz(2026, 11, 4, 10);
    expect(estimateEnd(3, c, start).last).toBe(start + 60000 + 60000 + 600000);
  });

  it('envio que passa do fim da janela continua no dia seguinte', () => {
    const start = fz(2026, 11, 4, 17, 29);
    const r = estimateEnd(
      2,
      { ...cfg, intervalo_min: 120, intervalo_max: 120 },
      start
    );
    expect(r.first).toBe(start);
    expect(r.last).toBe(fz(2026, 11, 5, 9));
  });

  it.each([
    ['sem destinatarios', 0, cfg],
    [
      'janela invertida',
      1,
      { ...cfg, janela_inicio: '18:00', janela_fim: '09:00' },
    ],
    ['horario invalido', 1, { ...cfg, janela_inicio: '9h' }],
    ['sem dias', 1, { ...cfg, dias: [] }],
  ])('%s -> null', (_, n, c) => {
    expect(estimateEnd(n, c, fz(2026, 11, 4, 10))).toBeNull();
  });

  it('envio unico sai na hora, qualquer dia', () => {
    const sab = fz(2026, 11, 7, 23, 0);
    expect(estimateEnd(1, SINGLE_CONFIG, sab).first).toBe(sab);
  });
});

describe('disparador — formatos', () => {
  it('formatDateTime em Fortaleza', () => {
    expect(formatDateTime(fz(2026, 11, 4, 9, 5))).toBe('04/11, 09:05');
    expect(formatDateTime(null)).toBe('—');
    expect(formatDateTime('lixo')).toBe('—');
  });

  it('toCsv: BOM, ";" e escape de aspas, ponto e virgula e quebra de linha', () => {
    const csv = toCsv(
      [
        { a: 'simples', b: 1 },
        { a: 'com;ponto', b: 'diz "oi"' },
        { a: 'linha\nnova', b: null },
      ],
      [
        { label: 'A', value: r => r.a },
        { label: 'B', value: r => r.b },
      ]
    );
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv.slice(1).split('\r\n')).toEqual([
      'A;B',
      'simples;1',
      '"com;ponto";"diz ""oi"""',
      '"linha\nnova";',
    ]);
  });

  it('progressOf soma os status e calcula o percentual', () => {
    expect(
      progressOf({
        total: 10,
        contagem: {
          enviado: 4,
          erro: 1,
          pulado: 1,
          cancelado: 0,
          pendente: 3,
          reservado: 1,
        },
      })
    ).toEqual({
      total: 10,
      enviados: 4,
      erros: 1,
      pulados: 1,
      cancelados: 0,
      pendentes: 4,
      pct: 60,
    });
    expect(progressOf({}).pct).toBe(0);
  });

  it('conversationOptions: uma por caixa, a mais recente, com regra de texto livre', () => {
    const inboxes = [
      {
        id: 15,
        name: 'BPC API',
        channel_type: 'Channel::Whatsapp',
        message_templates: [
          {
            name: 't',
            language: 'pt_BR',
            status: 'APPROVED',
            components: [{ type: 'BODY', text: 'x' }],
          },
        ],
      },
      { id: 6, name: 'Auxílio', channel_type: 'Channel::Api' },
    ];
    const out = conversationOptions(
      [
        { id: 1, inbox_id: 6, last_activity_at: 10, status: 'open' },
        { id: 2, inbox_id: 6, last_activity_at: 30, status: 'resolved' },
        { id: 3, inbox_id: 15, last_activity_at: 20, can_reply: false },
        { id: 4, inbox_id: 99, last_activity_at: 5 },
      ],
      inboxes
    );
    expect(out.map(o => o.conversation_id)).toEqual([2, 3, 4]);
    expect(out[0]).toMatchObject({
      inbox_nome: 'Auxílio',
      oficial: false,
      textoLivre: true,
      templates: [],
    });
    expect(out[1]).toMatchObject({ oficial: true, textoLivre: false });
    expect(out[1].templates).toHaveLength(1);
    expect(out[2].inbox_nome).toBe('Caixa 99');
    expect(conversationOptions(null, null)).toEqual([]);
  });
});

describe('disparador — constantes', () => {
  it('n8n da Goncalves e teto de destinatarios', () => {
    expect(DISPARADOR_URL).toMatch(
      /^https:\/\/n8n\.goncalvesesilva\.cloud\/webhook\//
    );
    expect(MAX_RECIPIENTS).toBe(3000);
  });

  it('ritmos: minimo <= maximo e o padrao e o "seguro"', () => {
    PACES.forEach(p => {
      expect(p.config.intervalo_min).toBeLessThanOrEqual(
        p.config.intervalo_max
      );
    });
    expect(PACES[0].id).toBe('seguro');
    expect(PACES[0].config.intervalo_min).toBe(DEFAULT_CONFIG.intervalo_min);
  });

  it('janelas validas e dias de 1 a 7', () => {
    WINDOWS.forEach(w => {
      expect(w.config.janela_inicio < w.config.janela_fim).toBe(true);
      w.config.dias.forEach(d => expect(WEEKDAYS.map(x => x.id)).toContain(d));
    });
  });
});
