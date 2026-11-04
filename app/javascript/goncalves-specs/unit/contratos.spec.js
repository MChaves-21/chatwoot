/**
 * Contratos entre as pecas do fork que vivem em linguagens/arquivos
 * diferentes. Quebrar um deles nao derruba build nenhum — so faz a tela
 * mostrar numero errado ou abrir para quem nao deveria.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  CATEGORIES,
  SENT_KEYS,
  PERIODS,
  DEFAULT_PERIOD,
} from 'dashboard/routes/dashboard/relatorioEquipe/constants';
import { FUNNEL_READING } from 'dashboard/routes/dashboard/dashboardIa/constants';
import { CLOSED_LABELS } from 'dashboard/routes/dashboard/kanban/stateConstants';

const read = p => readFileSync(resolve(process.cwd(), p), 'utf8');

describe('Relatorio da Equipe: categorias do front = categorias do Ruby', () => {
  const ruby = read('app/services/relatorio_equipe/report.rb');
  const rubyCats = ruby
    .match(/CATEGORIES = %w\[([^\]]+)\]/)[1]
    .trim()
    .split(/\s+/);

  it('mesmas chaves, na mesma ordem', () => {
    expect(CATEGORIES.map(c => c.key)).toEqual(rubyCats);
  });

  it('"enviadas" sao todas as categorias menos a recebida', () => {
    expect(SENT_KEYS).toEqual(rubyCats.filter(c => c !== 'recebida'));
  });

  it('periodo padrao existe', () => {
    expect(PERIODS.map(p => p.key)).toContain(DEFAULT_PERIOD);
  });
});

describe('Dashboard IA: etiquetas de assinatura do SQL = leitura dos funis', () => {
  const ruby = read(
    'app/controllers/api/v1/accounts/dashboard_ia_controller.rb'
  );
  const regex = ruby.match(/SIGNED_LABELS_REGEX = '([^']+)'/)[1];
  // (bpc_)?(a|b|c) -> [a, b, c, bpc_a, ...]
  const names = regex.match(/\(bpc_\)\?\(([^)]+)\)/)[1].split('|');
  const sqlLabels = new Set([...names, ...names.map(n => `bpc_${n}`)]);

  it.each(['auxilio_acidente', 'bpc'])(
    'toda etapa de %s a partir da assinatura entra na consulta de fechamentos',
    funnelId => {
      const f = FUNNEL_READING[funnelId];
      const from = f.path.indexOf(f.signedFrom);
      f.path.slice(from).forEach(l => expect(sqlLabels.has(l)).toBe(true));
    }
  );

  it('Dr. Gerardo e repescagem tambem (contam como analise medica)', () => {
    expect(sqlLabels.has('reprovado_dr_gerardo')).toBe(true);
    expect(sqlLabels.has('aprovado_repescagem')).toBe(true);
  });

  it('a regex casa a etiqueta inteira, nao pedaco (equivalente JS)', () => {
    const re = new RegExp(regex.replace(/\\\\/g, '\\'));
    expect(re.test('sdr,contrato_assinado')).toBe(true);
    expect(re.test('bpc_contrato_assinado, urgente')).toBe(true);
    expect(re.test('pre_contrato_assinado')).toBe(false);
    expect(re.test('contrato_assinado_x')).toBe(false);
  });
});

describe('Pipeline: a checagem 4 do verificar-goncalves.mjs le a mesma lista', () => {
  it('CLOSED_LABELS literal no arquivo bate com o modulo', () => {
    const src = read(
      'app/javascript/dashboard/routes/dashboard/kanban/stateConstants.js'
    );
    const m = src.match(/CLOSED_LABELS\s*=\s*\[([\s\S]*?)\]/);
    const literal = [...m[1].matchAll(/'([^']+)'/g)].map(x => x[1]);
    expect(literal).toEqual(CLOSED_LABELS);
  });
});

describe('Rotas do fork so para administrador', () => {
  it.each([
    'app/javascript/dashboard/routes/dashboard/dashboardIa/routes.js',
    'app/javascript/dashboard/routes/dashboard/relatorioEquipe/routes.js',
    'app/javascript/dashboard/routes/dashboard/disparador/routes.js',
  ])('%s exige administrator', file => {
    // So o objeto `meta` (os comentarios citam report_manage de proposito).
    const meta = read(file).match(/const meta = \{([\s\S]*?)\};/)[1];
    expect(meta).toMatch(/permissions:\s*\['administrator'\]/);
    expect(meta).not.toMatch(/report_manage|agent/);
  });

  it('os dois controllers do fork barram quem nao e administrador', () => {
    [
      'app/controllers/api/v1/accounts/dashboard_ia_controller.rb',
      'app/controllers/api/v1/accounts/relatorio_equipe_controller.rb',
    ].forEach(file => {
      const src = read(file);
      expect(src).toMatch(/before_action :ensure_administrator/);
      expect(src).toMatch(/administrator\?/);
      expect(src).toMatch(/status: :forbidden/);
    });
  });

  it('as tres rotas estao registradas no dashboard', () => {
    const src = read(
      'app/javascript/dashboard/routes/dashboard/dashboard.routes.js'
    );
    ['dashboardIaRoutes', 'disparadorRoutes', 'relatorioEquipeRoutes'].forEach(
      r => expect(src).toContain(`...${r}`)
    );
  });

  it('as rotas do backend existem em config/routes.rb', () => {
    const src = read('config/routes.rb');
    expect(src).toMatch(/resource :dashboard_ia, only: \[:show\]/);
    expect(src).toMatch(/patch :goals/);
    expect(src).toMatch(/resource :relatorio_equipe, only: \[:show\]/);
    expect(src).toMatch(/get :mensagens/);
    expect(src).toMatch(/patch :ia_users/);
  });
});
