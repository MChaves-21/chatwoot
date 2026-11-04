/**
 * Busca do Kanban — partes puras (search.js): normalizacao, termos de estado,
 * localizacao da conversa no funil. A busca no servidor fica no teste de
 * integracao.
 */
import {
  DISQUALIFIED_ONLY,
  locate,
  normalize,
  onlyDigits,
  STATE_TERMS,
  stateTermFor,
  stateTitle,
} from 'dashboard/routes/dashboard/kanban/search';
import { CLOSED_LABELS } from 'dashboard/routes/dashboard/kanban/stateConstants';

describe('kanban/search — normalizacao', () => {
  it('normalize tira acento, caixa e espaco das pontas', () => {
    expect(normalize('  ÉrCÍlia Conceição ')).toBe('ercilia conceicao');
    expect(normalize(null)).toBe('');
  });

  it('onlyDigits', () => {
    expect(onlyDigits('+55 (85) 99527-0000')).toBe('5585995270000');
    expect(onlyDigits(undefined)).toBe('');
  });
});

describe('kanban/search — termos de estado', () => {
  it.each([
    ['aguardando', 'aguardando'],
    ['Pendente', 'aguardando'],
    ['adiado', 'aguardando'],
    ['em atendimento', 'atendimento'],
    ['atend', 'atendimento'],
    ['aberto', 'aberto'],
    ['sem resposta', 'aberto'],
    ['Não respondido', 'aberto'],
    ['resolvida', 'resolvido'],
    ['fechado', 'fechado'],
    ['perdido', 'fechado'],
    ['descartado', 'fechado'],
    ['desqualificada', 'desqualificado'],
    ['desq', 'desqualificado'],
  ])('"%s" -> %s', (q, key) => {
    expect(stateTermFor(q).key).toBe(key);
  });

  it.each(['ab', 'abc', '', 'joao', 'maria silva', '85999'])(
    '"%s" nao e termo de estado',
    q => {
      expect(stateTermFor(q)).toBeNull();
    }
  );

  it('termo exato vence prefixo', () => {
    // "resolvido" e exato; nao pode cair em outro termo que comece igual.
    expect(stateTermFor('resolvido').key).toBe('resolvido');
  });

  const byKey = Object.fromEntries(STATE_TERMS.map(t => [t.key, t]));

  it('aguardando casa pending e snoozed', () => {
    expect(byKey.aguardando.match({ status: 'pending' })).toBe(true);
    expect(byKey.aguardando.match({ status: 'snoozed' })).toBe(true);
    expect(byKey.aguardando.match({ status: 'open' })).toBe(false);
  });

  it('atendimento x aberto separam pela primeira resposta', () => {
    const respondida = { status: 'open', first_reply_created_at: 1 };
    const semResposta = { status: 'open', first_reply_created_at: null };
    expect(byKey.atendimento.match(respondida)).toBe(true);
    expect(byKey.atendimento.match(semResposta)).toBe(false);
    expect(byKey.aberto.match(semResposta)).toBe(true);
    expect(byKey.aberto.match(respondida)).toBe(false);
  });

  it('resolvido exclui quem tem etiqueta de descarte', () => {
    expect(byKey.resolvido.match({ status: 'resolved', labels: [] })).toBe(
      true
    );
    expect(
      byKey.resolvido.match({ status: 'resolved', labels: ['desqualificado'] })
    ).toBe(false);
  });

  it('desqualificado e subconjunto proprio de fechado', () => {
    DISQUALIFIED_ONLY.forEach(l => expect(CLOSED_LABELS).toContain(l));
    const descarte = { labels: ['descarte_sdr'] };
    const desq = { labels: ['bpc_desqualificado'] };
    expect(byKey.fechado.match(descarte)).toBe(true);
    expect(byKey.desqualificado.match(descarte)).toBe(false);
    expect(byKey.fechado.match(desq)).toBe(true);
    expect(byKey.desqualificado.match(desq)).toBe(true);
  });

  it('match nao quebra com conversa sem etiquetas', () => {
    expect(byKey.fechado.match({})).toBe(false);
    expect(byKey.resolvido.match({ status: 'resolved' })).toBe(true);
  });
});

describe('kanban/search — locate e stateTitle', () => {
  it.each([
    [['urgente', 'comercial'], 6, 'Auxílio Acidente', 'Comercial'],
    [['bpc_pegar_senha'], 15, 'BPC', 'Pegar senha'],
    [['trab_objecao'], 10, 'Trabalhista', 'Objecao'],
    [[], 6, 'Auxílio Acidente', 'Sem etapa'],
    [[], 15, 'BPC', 'Sem etapa'],
    [[], 16, 'Auxílio Acidente', 'Sem etapa'],
    [[], 999, '—', 'Sem etapa'],
  ])('labels %j na caixa %i -> %s / %s', (labels, inbox, funnel, stage) => {
    expect(locate({ labels, inbox_id: inbox })).toEqual({ funnel, stage });
  });

  it('locate aguenta conversa nula', () => {
    expect(locate(null)).toEqual({ funnel: '—', stage: 'Sem etapa' });
  });

  it('stateTitle usa a primeira regra que casa e ignora "Desqualificado"', () => {
    expect(stateTitle({ status: 'pending' })).toBe('Aguardando');
    expect(stateTitle({ status: 'open' })).toBe('Aberto');
    expect(stateTitle({ status: 'open', first_reply_created_at: 1 })).toBe(
      'Em atendimento'
    );
    expect(stateTitle({ status: 'resolved', labels: [] })).toBe('Resolvido');
    expect(stateTitle({ status: 'open', labels: ['bpc_desqualificado'] })).toBe(
      'Aberto'
    );
    expect(stateTitle({ status: 'resolved', labels: ['desqualificado'] })).toBe(
      'Fechado'
    );
    expect(stateTitle({ status: 'xyz' })).toBe('');
  });
});
