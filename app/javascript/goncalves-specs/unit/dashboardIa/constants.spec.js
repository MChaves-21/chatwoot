/**
 * Dashboard IA — leitura comercial dos funis e tabelas fixas (constants.js),
 * geometria dos graficos (chart.js), mapa (brazilMap.js) e o parser de
 * atividade do plano B (api.js#addedLabels).
 */
import {
  ALL_DASH_FUNNELS,
  BUSINESS_HOURS,
  CLOSING_BUCKETS,
  DASH_FUNNELS,
  DAY_PARTS,
  DDD_UF,
  DEFAULT_MONTHLY_GOAL,
  DEFAULT_PERIOD,
  FUNNEL_READING,
  funnelsForAccount,
  isHomeAccount,
  LOSS_REASONS_FUNNEL_ID,
  LOSS_REASONS_URL,
  LOST_LABELS,
  PARTNER_DASH_FUNNELS,
  PERIODS,
  SIGNED_LABELS,
} from 'dashboard/routes/dashboard/dashboardIa/constants';
import {
  areaPath,
  donutArcs,
  gradient,
  smoothPath,
  tint,
} from 'dashboard/routes/dashboard/dashboardIa/chart';
import {
  BRAZIL_STATES,
  BRAZIL_VIEWBOX,
} from 'dashboard/routes/dashboard/dashboardIa/brazilMap';
import { addedLabels } from 'dashboard/routes/dashboard/dashboardIa/api';
import {
  FUNNELS,
  UNSTAGED_LABEL,
} from 'dashboard/routes/dashboard/kanban/constants';
import { CLOSED_LABELS } from 'dashboard/routes/dashboard/kanban/stateConstants';

describe('dashboardIa/constants — leitura dos funis', () => {
  it('todo funil do Kanban da Goncalves tem leitura no painel', () => {
    expect(DASH_FUNNELS.map(f => f.id)).toEqual(FUNNELS.map(f => f.id));
  });

  describe.each(ALL_DASH_FUNNELS.map(f => [f.id, f]))('%s', (_, f) => {
    const columnLabels = f.columns.map(c => c.label);

    it('caminho so tem etapas que sao coluna do funil', () => {
      f.path.forEach(l => expect(columnLabels).toContain(l));
    });

    it('caminho nao tem descarte nem repeticao', () => {
      expect(new Set(f.path).size).toBe(f.path.length);
      f.path.forEach(l => expect(CLOSED_LABELS).not.toContain(l));
    });

    it('qualificado vem antes de assinado, e os dois estao no caminho', () => {
      const q = f.path.indexOf(f.qualifiedFrom);
      expect(q).toBeGreaterThanOrEqual(0);
      if (f.signedFrom) {
        expect(f.path.indexOf(f.signedFrom)).toBeGreaterThan(q);
      }
    });

    it('rankAs aponta para etapa do caminho e vem de coluna fora dele', () => {
      Object.entries(f.rankAs || {}).forEach(([from, to]) => {
        expect(f.path).toContain(to);
        expect(f.path).not.toContain(from);
        expect(columnLabels).toContain(from);
      });
    });
  });

  it('0300 le igual ao Auxilio', () => {
    expect(FUNNEL_READING.lawchat_0300).toBe(FUNNEL_READING.auxilio_acidente);
  });

  it('BPC comeca em "Sem etapa"; Trabalhista nao tem assinatura', () => {
    expect(FUNNEL_READING.bpc.path[0]).toBe(UNSTAGED_LABEL);
    expect(FUNNEL_READING.trabalhista.signedFrom).toBeNull();
  });

  it('ids de caixa nao se repetem entre contas (o mapa caixa->funil e global)', () => {
    const ids = ALL_DASH_FUNNELS.map(f => f.inboxId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('funnelsForAccount: dona, parceira e conta qualquer', () => {
    expect(funnelsForAccount(1)).toBe(DASH_FUNNELS);
    expect(funnelsForAccount('1')).toBe(DASH_FUNNELS);
    expect(funnelsForAccount(3)).toBe(PARTNER_DASH_FUNNELS[3]);
    expect(funnelsForAccount(3).map(f => f.id)).toEqual([
      'fp_auxilio_acidente',
    ]);
    expect(funnelsForAccount(2)).toEqual([]);
    expect(isHomeAccount(1)).toBe(true);
    expect(isHomeAccount(3)).toBe(false);
  });

  it('SIGNED_LABELS sem repeticao', () => {
    expect(SIGNED_LABELS).toEqual([
      'contrato_assinado',
      'bpc_contrato_assinado',
    ]);
  });

  it('perdidos = descarte do Kanban (fonte unica)', () => {
    expect(LOST_LABELS).toBe(CLOSED_LABELS);
  });
});

describe('dashboardIa/constants — tabelas fixas', () => {
  it('horario comercial 8h-17h (22/10/2026)', () => {
    expect(BUSINESS_HOURS).toEqual({ from: 8, to: 17 });
  });

  it('faixas de fechamento sao crescentes e terminam no infinito', () => {
    const max = CLOSING_BUCKETS.map(b => b.max);
    expect(max).toEqual([...max].sort((a, b) => a - b));
    expect(max[max.length - 1]).toBe(Infinity);
  });

  it('periodos do dia cobrem as 24h sem sobrepor', () => {
    const hours = new Array(24).fill(0);
    DAY_PARTS.forEach(p => {
      for (let h = p.from; h < p.to; h += 1) hours[h] += 1;
    });
    expect(hours.every(n => n === 1)).toBe(true);
  });

  it('DDD -> UF cobre as 27 UFs e so DDDs validos', () => {
    expect(new Set(Object.values(DDD_UF)).size).toBe(27);
    Object.keys(DDD_UF).forEach(d => {
      expect(Number(d)).toBeGreaterThanOrEqual(11);
      expect(Number(d)).toBeLessThanOrEqual(99);
    });
    expect(DDD_UF[85]).toBe('CE');
    expect(DDD_UF[88]).toBe('CE');
    expect(DDD_UF[20]).toBeUndefined();
  });

  it('mapa tem as mesmas 27 UFs do DDD', () => {
    expect(BRAZIL_STATES).toHaveLength(27);
    expect(BRAZIL_STATES.map(s => s.uf).sort()).toEqual(
      [...new Set(Object.values(DDD_UF))].sort()
    );
    BRAZIL_STATES.forEach(s => expect(s.path).toMatch(/^m [\d.]/));
    expect(BRAZIL_VIEWBOX).toMatch(/^0 0 \d+ \d+$/);
  });

  it('periodo padrao existe e meta padrao e positiva', () => {
    expect(PERIODS.map(p => p.key)).toContain(DEFAULT_PERIOD);
    expect(DEFAULT_MONTHLY_GOAL).toBeGreaterThan(0);
  });

  it('motivos de descarte: n8n da Goncalves, so para o Auxilio', () => {
    expect(LOSS_REASONS_URL).toMatch(
      /^https:\/\/n8n\.goncalvesesilva\.cloud\//
    );
    expect(LOSS_REASONS_FUNNEL_ID).toBe('auxilio_acidente');
  });
});

describe('dashboardIa/chart', () => {
  it('smoothPath: vazio, 1 ponto e reta', () => {
    expect(smoothPath([])).toBe('');
    expect(smoothPath([[1, 2]])).toBe('M1,2');
    expect(
      smoothPath([
        [0, 0],
        [10, 10],
      ])
    ).toBe('M0.00,0.00 C3.33,3.33 6.67,6.67 10.00,10.00');
  });

  it('smoothPath nao ultrapassa os pontos (monotona) e passa por todos', () => {
    const pts = [
      [0, 50],
      [10, 0],
      [20, 0],
      [30, 50],
      [40, 49],
    ];
    const d = smoothPath(pts);
    const nums = d.match(/-?\d+\.\d+/g).map(Number);
    const ys = nums.filter((_, i) => i % 2 === 1);
    expect(Math.min(...ys)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...ys)).toBeLessThanOrEqual(50);
    pts.forEach(([x, y]) =>
      expect(d).toContain(`${x.toFixed(2)},${y.toFixed(2)}`)
    );
  });

  it('smoothPath aguenta x repetido (sem NaN)', () => {
    expect(
      smoothPath([
        [0, 1],
        [0, 2],
        [1, 3],
      ])
    ).not.toContain('NaN');
  });

  it('areaPath fecha na base', () => {
    const pts = [
      [0, 1],
      [5, 2],
    ];
    expect(areaPath('M0,1 L5,2', pts, 100)).toBe(
      'M0,1 L5,2 L5.00,100 L0.00,100 Z'
    );
    expect(areaPath('', [], 100)).toBe('');
  });

  it('donutArcs: fatias proporcionais, deslocamento acumulado', () => {
    const r = 10;
    const len = 2 * Math.PI * r;
    const arcs = donutArcs([{ value: 1 }, { value: 3 }, { value: 0 }], r);
    expect(arcs[0].offset).toBeCloseTo(-0);
    expect(arcs[1].offset).toBeCloseTo(-len / 4);
    expect(arcs[2].visible).toBe(false);
    expect(Number(arcs[1].dash.split(' ')[0])).toBeCloseTo((3 * len) / 4 - 1.5);
  });

  it('donutArcs com total zero', () => {
    const arcs = donutArcs([{ value: 0 }], 10);
    expect(arcs[0]).toMatchObject({ visible: false, offset: -0 });
  });

  it('tint e gradient usam color-mix', () => {
    expect(tint('#fff', 20)).toBe('color-mix(in srgb, #fff 20%, transparent)');
    expect(gradient('#000')).toContain('linear-gradient(90deg, #000');
  });
});

describe('dashboardIa/api — addedLabels (historico de etiquetas no plano B)', () => {
  it.each([
    ['Karol adicionou contrato_assinado', ['contrato_assinado']],
    ['Maria da Silva adicionou sdr, urgente', ['sdr', 'urgente']],
    ['Admin added bpc_contrato_assinado', ['bpc_contrato_assinado']],
    ['Karol removeu sdr', []],
    ['Conversa resolvida por Karol', []],
    ['', []],
    [null, []],
  ])('%p -> %j', (content, labels) => {
    expect(addedLabels(content)).toEqual(labels);
  });

  it('nao confunde contrato_assinado com bpc_contrato_assinado', () => {
    expect(addedLabels('X adicionou bpc_contrato_assinado')).not.toContain(
      'contrato_assinado'
    );
  });
});
