/**
 * Dashboard IA — as contas (metrics.js).
 *
 * Datas montadas em UTC e conferidas em Sao Paulo (UTC-3, sem horario de
 * verao desde 2019): 15:00Z = 12:00 em SP; 02:00Z = 23:00 do dia anterior.
 */
import {
  assigneeOptions,
  byAssignee,
  byState,
  closing,
  daysBetween,
  filterPeriod,
  filterRange,
  filterScope,
  funnelById,
  funnelSteps,
  isBusinessHour,
  kpis,
  monthlyGoal,
  newChats,
  periodRange,
  previousRange,
  shiftYmd,
  signedAtFromHistory,
  spParts,
  stageDurations,
  stageTable,
  toRow,
  toRowFromSnapshot,
  ufFromPhone,
  weekdayOf,
  weeklySeries,
  ymdToBR,
} from 'dashboard/routes/dashboard/dashboardIa/metrics';
import { ALL_FUNNELS_ID } from 'dashboard/routes/dashboard/dashboardIa/constants';
import { UNSTAGED_LABEL } from 'dashboard/routes/dashboard/kanban/constants';

const DAY_MS = 86400000;
// Epoch (segundos) de uma hora de Sao Paulo.
const sp = (y, m, d, h = 12, min = 0) =>
  Date.UTC(y, m - 1, d, h + 3, min) / 1000;

let seq = 0;
const conv = ({
  inbox = 6,
  labels = [],
  created = sp(2026, 10, 20),
  updated = null,
  phone = '+5585999990000',
  assignee = null,
  id = null,
} = {}) => {
  seq += 1;
  return {
    id: id ?? seq,
    inbox_id: inbox,
    labels,
    created_at: created,
    last_activity_at: updated ?? created,
    meta: { sender: { phone_number: phone }, assignee },
  };
};
const row = (opts, extra) => toRow(conv(opts), extra);

describe('metrics — datas', () => {
  it('spParts usa o fuso de Sao Paulo', () => {
    expect(spParts(Date.UTC(2026, 9, 27, 2, 30))).toEqual({
      ymd: '2026-10-26',
      hour: 23,
    });
    expect(spParts(Date.UTC(2026, 9, 27, 3, 0))).toEqual({
      ymd: '2026-10-27',
      hour: 0,
    });
  });

  it.each([
    ['2026-10-31', 1, '2026-11-01'],
    ['2026-03-01', -1, '2026-02-28'],
    ['2028-03-01', -1, '2028-02-29'],
    ['2026-12-31', 1, '2027-01-01'],
  ])('shiftYmd(%s, %i) = %s', (a, d, b) => {
    expect(shiftYmd(a, d)).toBe(b);
  });

  it('weekdayOf e ymdToBR', () => {
    expect(weekdayOf('2026-11-04')).toBe(3); // quarta
    expect(weekdayOf('2026-11-01')).toBe(0); // domingo
    expect(ymdToBR('2026-11-04')).toBe('04/11');
  });

  it('daysBetween', () => {
    expect(daysBetween('2026-10-01', '2026-10-31')).toBe(30);
    expect(daysBetween('2026-10-31', '2026-10-01')).toBe(-30);
  });

  it.each([
    [1, 8, true],
    [5, 16, true],
    [1, 7, false],
    [1, 17, false], // 17:00 ja e fora (regra de 22/10/2026)
    [0, 10, false], // domingo
    [6, 10, false], // sabado
  ])('isBusinessHour(dia %i, %ih) = %p', (wd, h, ok) => {
    expect(isBusinessHour(wd, h)).toBe(ok);
  });
});

describe('metrics — UF pelo telefone', () => {
  it.each([
    ['+5585999990000', 'CE'],
    ['5511987654321', 'SP'],
    ['(21) 99999-0000', 'RJ'],
    ['8532221100', 'CE'],
    ['+12025550123', null], // estrangeiro com 11 digitos
    ['+558599999', null], // curto
    ['5520999990000', null], // DDD inexistente
    ['', null],
    [null, null],
  ])('%p -> %p', (phone, uf) => {
    expect(ufFromPhone(phone)).toBe(uf);
  });
});

describe('metrics — toRow', () => {
  it('ignora caixa fora dos funis e conversa sem data', () => {
    expect(row({ inbox: 999 })).toBeNull();
    expect(toRow({ id: 1, inbox_id: 6, labels: [] })).toBeNull();
  });

  it('linha basica do Auxilio', () => {
    const r = row({
      labels: ['comercial', 'urgente'],
      created: sp(2026, 10, 26, 23, 30),
      assignee: { id: 7, name: 'Karol' },
    });
    expect(r).toMatchObject({
      funnelId: 'auxilio_acidente',
      stage: 'comercial',
      rank: 1,
      lost: false,
      imported: false,
      signed: false,
      qualified: true,
      createdYmd: '2026-10-26',
      createdHour: 23,
      createdWeekday: 1,
      assigneeId: 7,
      assigneeName: 'Karol',
      uf: 'CE',
    });
  });

  it('nao guarda o telefone na linha', () => {
    const r = row({ phone: '+5585999990000' });
    expect(JSON.stringify(r)).not.toContain('999990000');
  });

  it('descarte vence outra etapa (sdr + desqualificado)', () => {
    const r = row({ labels: ['sdr', 'desqualificado'] });
    expect(r.stage).toBe('desqualificado');
    expect(r.lost).toBe(true);
    expect(r.rank).toBe(-1);
  });

  it('sem etapa no Auxilio fica fora do caminho', () => {
    const r = row({ labels: ['urgente'] });
    expect(r.stage).toBe(UNSTAGED_LABEL);
    expect(r.rank).toBe(-1);
    expect(r.qualified).toBe(false);
  });

  it('sem etapa no BPC e o primeiro passo do caminho', () => {
    const r = row({ inbox: 15, labels: [] });
    expect(r.funnelId).toBe('bpc');
    expect(r.rank).toBe(0);
  });

  it('contrato assinado ou alem conta como assinado e qualificado', () => {
    ['contrato_assinado', 'analise_medica', 'efetivado'].forEach(l => {
      const r = row({ labels: [l] });
      expect(r.signed).toBe(true);
      expect(r.qualified).toBe(true);
    });
    expect(row({ labels: ['aguardando_assinatura'] }).signed).toBe(false);
  });

  it('Dr. Gerardo e repescagem contam como analise medica (rankAs)', () => {
    const r1 = row({ labels: ['reprovado_dr_gerardo'] });
    const r2 = row({ labels: ['aprovado_repescagem'] });
    expect(r1.rank).toBe(5);
    expect(r2.rank).toBe(5);
    expect(r1.signed).toBe(true);
  });

  it('com historico: quem ALGUMA VEZ assinou continua assinado depois de descartado', () => {
    const history = { contrato_assinado: 1000, desqualificado: 2000 };
    const r = row({ labels: ['desqualificado'] }, { history });
    expect(r.lost).toBe(true);
    expect(r.signed).toBe(true);
    expect(r.qualified).toBe(true);
  });

  it('com historico: passou por comercial = qualificado', () => {
    const r = row({ labels: ['descarte_sdr'] }, { history: { comercial: 1 } });
    expect(r.qualified).toBe(true);
    expect(r.signed).toBe(false);
  });

  it('Trabalhista nao tem etapa de assinatura', () => {
    const r = row({ inbox: 10, labels: ['trab_contrato_enviado'] });
    expect(r.funnelId).toBe('trabalhista');
    expect(r.signed).toBe(false);
    expect(r.qualified).toBe(true);
  });

  it('0300 (caixa 11) usa a leitura do Auxilio', () => {
    const r = row({ inbox: 11, labels: ['contrato_assinado'] });
    expect(r.funnelId).toBe('lawchat_0300');
    expect(r.signed).toBe(true);
  });

  it('F&P (caixa 16) entra no painel com o funil dele', () => {
    const r = row({ inbox: 16, labels: ['contrato_assinado'] });
    expect(r.funnelId).toBe('fp_auxilio_acidente');
    expect(r.signed).toBe(true);
  });

  it('importado', () => {
    expect(row({ labels: ['importado'] }).imported).toBe(true);
  });

  it('sem responsavel vira id 0 "Nao atribuido"', () => {
    const r = row({});
    expect(r.assigneeId).toBe(0);
    expect(r.assigneeName).toBe('Não atribuído');
  });

  it('updatedYmd cai para a criacao quando nao ha atividade', () => {
    const r = toRow({
      id: 1,
      inbox_id: 6,
      labels: [],
      created_at: sp(2026, 10, 1),
    });
    expect(r.updatedYmd).toBe('2026-10-01');
  });

  it('uf de `extra` vence o telefone', () => {
    expect(row({}, { uf: 'SP' }).uf).toBe('SP');
    expect(row({}, { uf: null }).uf).toBeNull();
  });
});

describe('metrics — toRowFromSnapshot (formato do endpoint do fork)', () => {
  it('monta a linha a partir do array enxuto', () => {
    const r = toRowFromSnapshot(
      [42, 6, ['contrato_assinado'], sp(2026, 10, 1), sp(2026, 10, 2), 9, '11'],
      {
        agents: { 9: 'Ana' },
        stages: { comercial: 100, contrato_assinado: 200 },
      }
    );
    expect(r).toMatchObject({
      id: 42,
      funnelId: 'auxilio_acidente',
      signed: true,
      assigneeId: 9,
      assigneeName: 'Ana',
      uf: 'SP',
      createdYmd: '2026-10-01',
      updatedYmd: '2026-10-02',
    });
    expect(r.history).toEqual({ comercial: 100000, contrato_assinado: 200000 });
  });

  it('agente sem nome e DDD desconhecido', () => {
    const r = toRowFromSnapshot([1, 6, [], sp(2026, 10, 1), null, 5, '20']);
    expect(r.assigneeName).toBe('Agente 5');
    expect(r.uf).toBeNull();
  });

  it('sem responsavel e sem DDD', () => {
    const r = toRowFromSnapshot([1, 6, [], sp(2026, 10, 1), null, null, null]);
    expect(r.assigneeId).toBe(0);
    expect(r.uf).toBeNull();
  });

  it('caixa fora dos funis devolve null', () => {
    expect(toRowFromSnapshot([1, 3, [], sp(2026, 10, 1)])).toBeNull();
  });
});

describe('metrics — signedAtFromHistory', () => {
  it('pega a primeira etiqueta de assinatura ou posterior', () => {
    const r = row(
      { labels: ['efetivado'] },
      {
        history: {
          comercial: 1,
          analise_medica: 5000,
          contrato_assinado: 7000,
          efetivado: 9000,
        },
      }
    );
    expect(signedAtFromHistory(r)).toBe(5000);
  });

  it('null sem historico ou em funil sem assinatura', () => {
    expect(
      signedAtFromHistory(row({ labels: ['contrato_assinado'] }))
    ).toBeNull();
    expect(
      signedAtFromHistory(
        row({ inbox: 10 }, { history: { trab_fechamento: 1 } })
      )
    ).toBeNull();
  });
});

describe('metrics — periodos e filtros', () => {
  const today = '2026-11-04';

  it.each([
    ['hoje', { from: today, to: today }],
    ['ontem', { from: '2026-11-03', to: '2026-11-03' }],
    ['7d', { from: '2026-10-29', to: today }],
    ['30d', { from: '2026-10-06', to: today }],
    ['mes', { from: '2026-11-01', to: today }],
    ['tudo', null],
    ['xyz', null],
  ])('periodRange(%s)', (key, expected) => {
    expect(periodRange(key, today)).toEqual(expected);
  });

  it('personalizado: precisa das duas datas e desinverte', () => {
    expect(periodRange('custom', today, { from: '2026-10-01' })).toBeNull();
    expect(
      periodRange('custom', today, { from: '2026-10-10', to: '2026-10-01' })
    ).toEqual({ from: '2026-10-01', to: '2026-10-10' });
  });

  it.each([
    ['hoje', { from: '2026-11-03', to: '2026-11-03' }],
    ['7d', { from: '2026-10-22', to: '2026-10-28' }],
    ['mes', { from: '2026-10-01', to: '2026-10-04' }],
    ['tudo', null],
  ])('previousRange(%s)', (key, expected) => {
    expect(previousRange(key, today)).toEqual(expected);
  });

  it('previousRange de "mes" respeita mes mais curto', () => {
    expect(previousRange('mes', '2026-03-31')).toEqual({
      from: '2026-02-01',
      to: '2026-02-28',
    });
    expect(previousRange('mes', '2026-01-15')).toEqual({
      from: '2025-12-01',
      to: '2025-12-15',
    });
  });

  it('filterRange / filterPeriod por criacao ou atualizacao', () => {
    const rows = [
      row({ created: sp(2026, 11, 1), updated: sp(2026, 11, 4) }),
      row({ created: sp(2026, 11, 4) }),
    ];
    const range = { from: '2026-11-04', to: '2026-11-04' };
    expect(filterRange(rows, range, 'criacao')).toHaveLength(1);
    expect(filterRange(rows, range, 'atualizacao')).toHaveLength(2);
    expect(filterRange(rows, null, 'criacao')).toBe(rows);
    expect(
      filterPeriod(rows, { period: 'hoje', mode: 'criacao', todayYmd: today })
    ).toHaveLength(1);
    expect(
      filterPeriod(rows, { period: 'tudo', mode: 'criacao', todayYmd: today })
    ).toBe(rows);
  });

  it('filterScope: funil, responsavel e importados', () => {
    const rows = [
      row({ inbox: 6, assignee: { id: 1, name: 'A' } }),
      row({ inbox: 15 }),
      row({ inbox: 6, labels: ['importado'] }),
    ];
    expect(
      filterScope(rows, { funnelId: ALL_FUNNELS_ID, assigneeId: null })
    ).toHaveLength(2);
    expect(
      filterScope(rows, {
        funnelId: ALL_FUNNELS_ID,
        assigneeId: null,
        withImported: true,
      })
    ).toHaveLength(3);
    expect(
      filterScope(rows, { funnelId: 'bpc', assigneeId: null })
    ).toHaveLength(1);
    expect(
      filterScope(rows, { funnelId: ALL_FUNNELS_ID, assigneeId: 1 })
    ).toHaveLength(1);
    expect(
      filterScope(rows, { funnelId: ALL_FUNNELS_ID, assigneeId: 0 })
    ).toHaveLength(1);
  });

  it('assigneeOptions ordena por volume', () => {
    const rows = [
      row({ assignee: { id: 1, name: 'A' } }),
      row({ assignee: { id: 2, name: 'B' } }),
      row({ assignee: { id: 2, name: 'B' } }),
    ];
    expect(assigneeOptions(rows)).toEqual([
      { id: 2, name: 'B', count: 2 },
      { id: 1, name: 'A', count: 1 },
    ]);
  });
});

describe('metrics — indicadores', () => {
  it('kpis com base vazia nao divide por zero', () => {
    expect(kpis([])).toEqual({
      total: 0,
      offHours: 0,
      offHoursPct: 0,
      signed: 0,
      qualified: 0,
      lost: 0,
      conversion: 0,
      efficiency: 0,
      qualifiedPct: 0,
      lostPct: 0,
    });
  });

  it('kpis conta assinados, qualificados, perdidos e fora do horario', () => {
    const rows = [
      row({ labels: ['sdr'], created: sp(2026, 11, 4, 9) }), // qua 9h
      row({ labels: ['comercial'], created: sp(2026, 11, 4, 17) }), // 17h fora
      row({ labels: ['contrato_assinado'], created: sp(2026, 11, 1, 10) }), // domingo
      row({ labels: ['desqualificado'], created: sp(2026, 11, 3, 3) }), // madrugada
    ];
    const k = kpis(rows);
    expect(k).toMatchObject({
      total: 4,
      signed: 1,
      qualified: 2,
      lost: 1,
      offHours: 3,
      offHoursPct: 75,
      conversion: 25,
      efficiency: 50,
      qualifiedPct: 50,
      lostPct: 25,
    });
  });

  it('stageTable: todas as colunas do funil, com tipo e percentual', () => {
    const f = funnelById('auxilio_acidente');
    const rows = [
      row({ labels: ['sdr'] }),
      row({ labels: ['sdr'] }),
      row({ labels: ['desqualificado'] }),
      row({ labels: ['aguardando_tempo'] }),
      row({ inbox: 15, labels: ['bpc_lead_novo'] }),
    ];
    const t = stageTable(rows, f);
    expect(t.map(x => x.label)).toEqual(f.columns.map(c => c.label));
    const by = Object.fromEntries(t.map(x => [x.label, x]));
    expect(by.sdr).toMatchObject({ count: 2, pct: 50, kind: 'path' });
    expect(by.desqualificado).toMatchObject({ count: 1, kind: 'lost' });
    expect(by.aguardando_tempo).toMatchObject({ count: 1, kind: 'wait' });
    expect(by[UNSTAGED_LABEL]).toMatchObject({ count: 0, kind: 'wait' });
    expect(t.reduce((s, x) => s + x.count, 0)).toBe(4);
  });

  it('stageTable: funil sem coluna "Sem etapa" ganha a linha so se houver conversa', () => {
    const f = funnelById('trabalhista');
    expect(stageTable([], f).some(x => x.label === UNSTAGED_LABEL)).toBe(false);
    const t = stageTable([row({ inbox: 10, labels: [] })], f);
    expect(t[0]).toMatchObject({ label: UNSTAGED_LABEL, count: 1 });
  });

  it('funnelSteps acumula "nela ou alem"', () => {
    const f = funnelById('auxilio_acidente');
    const rows = [
      row({ labels: ['sdr'] }),
      row({ labels: ['comercial'] }),
      row({ labels: ['contrato_assinado'] }),
      row({ labels: ['desqualificado'] }),
    ];
    const s = funnelSteps(rows, f);
    expect(s.total).toBe(4);
    expect(s.off).toBe(1);
    expect(s.steps.map(x => x.reached)).toEqual([3, 2, 1, 1, 1, 0, 0, 0]);
    expect(s.steps[0]).toMatchObject({ title: 'SDR', pct: 75 });
    expect(s.steps[0].next).toBeCloseTo((2 / 3) * 100);
    expect(s.steps[7].next).toBeNull();
    expect(s.steps[6].next).toBe(0);
  });

  it('weeklySeries: 12 semanas terminando hoje', () => {
    const today = '2026-11-04';
    const rows = [
      row({ created: sp(2026, 11, 4), labels: ['contrato_assinado'] }),
      row({ created: sp(2026, 10, 29), labels: ['comercial'] }),
      row({ created: sp(2026, 10, 28) }), // semana anterior
      row({ created: sp(2026, 1, 1) }), // fora da janela
    ];
    const w = weeklySeries(rows, { todayYmd: today });
    expect(w.total).toHaveLength(12);
    expect(w.total.slice(-2)).toEqual([1, 2]);
    expect(w.signed.slice(-1)).toEqual([1]);
    expect(w.conversion.slice(-1)).toEqual([50]);
    expect(w.efficiency.slice(-1)).toEqual([50]);
    expect(w.total.reduce((a, b) => a + b, 0)).toBe(3);
  });

  it('byAssignee: "Nao atribuido" sempre por ultimo', () => {
    const rows = [
      row({ labels: ['contrato_assinado'] }),
      row({ labels: ['contrato_assinado'] }),
      row({ assignee: { id: 1, name: 'A' }, labels: ['sdr'] }),
      row({ assignee: { id: 2, name: 'B' }, labels: ['contrato_assinado'] }),
    ];
    const r = byAssignee(rows);
    expect(r.map(x => x.id)).toEqual([2, 1, 0]);
    expect(r[2]).toMatchObject({ total: 2, signed: 2, conversion: 100 });
  });

  it('stageDurations mede da entrada na etapa ate a proxima registrada', () => {
    const f = funnelById('auxilio_acidente');
    const t0 = sp(2026, 10, 1) * 1000;
    const rows = [
      row(
        {},
        {
          history: {
            sdr: t0,
            comercial: t0 + 2 * DAY_MS,
            contrato_assinado: t0 + 5 * DAY_MS,
          },
        }
      ),
      row({}, { history: { sdr: t0, comercial: t0 + 4 * DAY_MS } }),
      row({}, { history: { comercial: t0 + 10 * DAY_MS } }),
    ];
    const d = stageDurations(rows, f);
    const by = Object.fromEntries(d.map(x => [x.label, x]));
    expect(by.sdr).toMatchObject({ n: 2, avgDays: 3, medianDays: 3 });
    expect(by.comercial).toMatchObject({ n: 1, avgDays: 3 });
    expect(by.efetivado).toMatchObject({ n: 0, avgDays: 0, medianDays: 0 });
    expect(d.some(x => x.label === UNSTAGED_LABEL)).toBe(false);
  });

  it('stageDurations ignora etapa posterior registrada ANTES (dado fora de ordem)', () => {
    const f = funnelById('auxilio_acidente');
    const d = stageDurations(
      [row({}, { history: { sdr: 5 * DAY_MS + 1, comercial: 1 * DAY_MS } })],
      f
    );
    expect(d.find(x => x.label === 'sdr').n).toBe(0);
  });

  it('stageDurations do BPC tira a "Sem etapa" do resultado', () => {
    const d = stageDurations([], funnelById('bpc'));
    expect(d[0].label).toBe('bpc_lead_novo');
  });
});

describe('metrics — tempo ate fechamento e meta', () => {
  it('closing: faixas, media, mediana e contratos sem data', () => {
    const a = row({ labels: ['contrato_assinado'], created: sp(2026, 10, 1) });
    const b = row({ labels: ['contrato_assinado'], created: sp(2026, 10, 1) });
    const c = row({ labels: ['contrato_assinado'], created: sp(2026, 10, 1) });
    const d = row({ labels: ['contrato_assinado'], created: sp(2026, 10, 1) });
    const e = row({ labels: ['sdr'] });
    const signedAt = {
      [a.id]: a.createdMs + 0.5 * DAY_MS,
      [b.id]: b.createdMs + 4 * DAY_MS,
      [c.id]: c.createdMs + 20 * DAY_MS,
      // d sem data; data antes da criacao tambem e descartada
      [e.id]: e.createdMs,
    };
    const r = closing([a, b, c, d, e], signedAt);
    expect(r.n).toBe(3);
    expect(r.missing).toBe(1);
    expect(r.avgDays).toBeCloseTo(24.5 / 3);
    expect(r.avgHours).toBeCloseTo((24.5 / 3) * 24);
    expect(r.medianDays).toBe(4);
    expect(r.buckets.map(x => x.count)).toEqual([1, 0, 1, 0, 1]);
    expect(r.buckets.reduce((s, x) => s + x.pct, 0)).toBeCloseTo(100);
  });

  it('closing: assinatura com data anterior a criacao fica fora', () => {
    const a = row({ labels: ['contrato_assinado'] });
    expect(closing([a], { [a.id]: a.createdMs - 1 }).n).toBe(0);
  });

  it('monthlyGoal conta pela DATA DA ASSINATURA', () => {
    const today = '2026-11-10';
    const agosto = row({
      labels: ['contrato_assinado'],
      created: sp(2026, 8, 1),
    });
    const nov3 = row({ labels: ['efetivado'], created: sp(2026, 10, 20) });
    const nov3b = row({
      labels: ['contrato_assinado'],
      created: sp(2026, 10, 20),
    });
    const out = row({
      labels: ['contrato_assinado'],
      created: sp(2026, 10, 1),
    });
    const semData = row({ labels: ['contrato_assinado'] });
    const signedAt = {
      [agosto.id]: sp(2026, 11, 2) * 1000,
      [nov3.id]: sp(2026, 11, 3) * 1000,
      [nov3b.id]: sp(2026, 11, 3, 23, 59) * 1000,
      [out.id]: sp(2026, 10, 31) * 1000,
    };
    const g = monthlyGoal([agosto, nov3, nov3b, out, semData], signedAt, {
      goal: 60,
      todayYmd: today,
    });
    expect(g).toMatchObject({
      goal: 60,
      done: 3,
      donePct: 5,
      left: 57,
      projection: 9,
      daysLeft: 20,
      missing: 1,
      month: '2026-11',
      bestDay: { day: 3, count: 2 },
    });
    expect(g.neededPerDay).toBeCloseTo(57 / 20);
    expect(g.series).toHaveLength(30);
    expect(g.series[2].done).toBe(3);
    expect(g.series[9].done).toBe(3);
    expect(g.series[10].done).toBeNull();
    expect(g.series[8].projection).toBeNull();
    expect(g.series[9].projection).toBe(3);
    expect(g.series[29].projection).toBeCloseTo(9);
    expect(g.series[29].target).toBeCloseTo(60);
  });

  it('monthlyGoal no ultimo dia e com meta batida', () => {
    const r = row({ labels: ['contrato_assinado'] });
    const g = monthlyGoal(
      [r],
      { [r.id]: sp(2026, 11, 30) * 1000 },
      {
        goal: 1,
        todayYmd: '2026-11-30',
      }
    );
    expect(g.left).toBe(0);
    expect(g.daysLeft).toBe(0);
    expect(g.neededPerDay).toBe(0);
    expect(g.donePct).toBe(100);
  });

  it('monthlyGoal sem contrato', () => {
    const g = monthlyGoal([], {}, { goal: 0, todayYmd: '2026-02-01' });
    expect(g).toMatchObject({
      done: 0,
      projection: 0,
      bestDay: null,
      donePct: 0,
    });
    expect(g.series).toHaveLength(28);
  });
});

describe('metrics — novos chats e estados', () => {
  it('newChats: serie por dia, periodo anterior, pico, faixas do dia e grade', () => {
    const today = '2026-11-04';
    const rows = [
      row({ created: sp(2026, 11, 4, 9) }),
      row({ created: sp(2026, 11, 4, 9) }),
      row({ created: sp(2026, 11, 3, 20) }),
      row({ created: sp(2026, 11, 1, 2) }), // domingo de madrugada
      row({ created: sp(2026, 10, 30, 10) }), // periodo anterior (7d)
      row({ created: sp(2026, 10, 1) }), // fora
    ];
    const n = newChats(rows, { days: 7, todayYmd: today });
    expect(n.series.map(s => s.ymd)).toEqual([
      '2026-10-29',
      '2026-10-30',
      '2026-10-31',
      '2026-11-01',
      '2026-11-02',
      '2026-11-03',
      '2026-11-04',
    ]);
    // 30/10 esta DENTRO da janela de 7 dias (29/10 a 04/11).
    expect(n.total).toBe(5);
    expect(n.previous).toBe(0);
    expect(n.change).toBeNull();
    expect(n.peak).toMatchObject({ ymd: '2026-11-04', count: 2 });
    expect(n.peakHour).toBe(9);
    expect(n.grid[0][2]).toBe(1);
    expect(n.grid[3][9]).toBe(2);
    const parts = Object.fromEntries(n.parts.map(p => [p.key, p.count]));
    expect(parts).toEqual({ manha: 3, tarde: 0, noite: 1, madrugada: 1 });
    expect(n.top[0]).toMatchObject({ ymd: '2026-11-04', count: 2, pct: 40 });
    expect(n.avg).toBeCloseTo(5 / 7);
    expect(n.series[6].avg).toBeCloseTo(5 / 7);
  });

  it('newChats: variacao contra o periodo anterior e tendencia', () => {
    const rows = [
      row({ created: sp(2026, 11, 4) }),
      row({ created: sp(2026, 11, 4) }),
      row({ created: sp(2026, 11, 3) }),
      row({ created: sp(2026, 11, 1) }),
    ];
    const n = newChats(rows, { days: 2, todayYmd: '2026-11-04' });
    // Janela: 03 e 04/11. Anterior do mesmo tamanho: 01 e 02/11.
    expect(n.total).toBe(3);
    expect(n.previous).toBe(1);
    expect(n.change).toBeCloseTo(200);
    // Tendencia: 2a metade (04/11: 2) contra a 1a (03/11: 1).
    expect(n.trend).toBeCloseTo(100);
  });

  it('newChats sem nenhum lead', () => {
    const n = newChats([], { days: 7, todayYmd: '2026-11-04' });
    expect(n.total).toBe(0);
    expect(n.peakHour).toBeNull();
    expect(n.trend).toBeNull();
    expect(n.top).toEqual([]);
  });

  it('byState agrupa por UF e conta desconhecidos', () => {
    const rows = [
      row({ phone: '+5585999990000', labels: ['contrato_assinado'] }),
      row({ phone: '+5588999990000' }),
      row({ phone: '+5511999990000' }),
      row({ phone: '+12025550123' }),
    ];
    const s = byState(rows);
    expect(s.unknown).toBe(1);
    expect(s.known).toBe(3);
    expect(s.list[0]).toMatchObject({ uf: 'CE', leads: 2, signed: 1 });
    expect(s.list[0].pct).toBeCloseTo((2 / 3) * 100);
    expect(s.list[1]).toMatchObject({ uf: 'SP', leads: 1, signed: 0 });
  });
});
