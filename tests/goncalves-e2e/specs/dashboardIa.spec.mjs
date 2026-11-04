/**
 * Dashboard IA — ponta a ponta. Relogio do navegador fixo em 04/11/2026
 * 12:00 (Sao Paulo), o mesmo "hoje" do servidor falso.
 *
 * Base do cenario `dashboard` (Todos os funis, Todo periodo):
 *   5 leads (o importado fica fora), 2 contratos (Auxilio #1 pela IA,
 *   BPC #6 pela equipe), 3 qualificados, 1 descartado, 1 fora do horario.
 */
import { test, expect } from '@playwright/test';
import { fakeState, failNext, resetFake, watchErrors } from './helpers.mjs';

const NOW = new Date('2026-11-04T15:00:00Z');

let errors = [];
test.beforeEach(async ({ page }) => {
  errors = watchErrors(page);
  await page.clock.setFixedTime(NOW);
});
test.afterEach(() => {
  expect(errors, 'erros no console do navegador').toEqual([]);
});

const kpi = (page, label) =>
  page
    .locator('div.min-w-0')
    .filter({ has: page.locator('span.text-xs', { hasText: new RegExp(`^${label}$`) }) })
    .locator('span.tabular-nums')
    .first();

// Bloco "Quem fechou": <span>rotulo</span><span>valor</span>.
const stat = (page, label) => page.locator(`span:text-is("${label}") + span`).first();

const open = async (page, request, opts = {}) => {
  await resetFake(request, { scenario: 'dashboard', ...opts });
  await page.goto(`/app/accounts/${opts.accountId || 1}/dashboard-ia`);
};

test.describe('Administrador (endpoint do fork)', () => {
  test('abre com os indicadores do topo certos', async ({ page, request }) => {
    await open(page, request);
    await expect(page.getByRole('heading', { name: 'Dashboard IA' })).toBeVisible();
    await expect(kpi(page, 'Conversas')).toHaveText('5');
    await expect(kpi(page, 'Contratos assinados')).toHaveText('2');
    await expect(kpi(page, 'Qualificados')).toHaveText('60,0%');
    await expect(kpi(page, 'Conversão')).toHaveText('40,0%');
    await expect(page.getByText('20,0% fora do horário')).toBeVisible();
  });

  test('uma requisicao so ao endpoint do fork, sem varrer conversas', async ({ page, request }) => {
    await open(page, request);
    await expect(kpi(page, 'Conversas')).toHaveText('5');
    const { log } = await fakeState(request);
    expect(log.filter(l => l.path.endsWith('/dashboard_ia'))).toHaveLength(1);
    expect(log.filter(l => l.path.endsWith('/conversations'))).toHaveLength(0);
  });

  test('meta do mes: 2 de 60 e editar grava no servidor', async ({ page, request }) => {
    await open(page, request);
    await expect(page.getByText(/Meta .* · /).first()).toBeVisible();
    await expect(page.getByText('de 60')).toBeVisible();
    await page.getByRole('button', { name: 'Alterar a meta' }).click();
    await page.getByLabel('Meta mensal de contratos').fill('25');
    await page.getByRole('button', { name: 'Salvar' }).click();
    await expect(page.getByText('de 25')).toBeVisible();
    const { accountAttributes } = await fakeState(request);
    expect(accountAttributes.dashboard_ia_goals).toEqual({ __todos__: 25 });
    // Outro navegador (recarregar sem cache) ve a mesma meta.
    await page.reload();
    await expect(page.getByText('de 25')).toBeVisible();
  });

  test('"Quem fechou": IA, equipe e o rodape com 8h as 17h', async ({ page, request }) => {
    await open(page, request);
    await expect(stat(page, 'Assinados')).toHaveText('2');
    await expect(stat(page, 'Fechados pela IA')).toHaveText(/^1\s*\(50,0%\)\s*$/);
    await expect(stat(page, 'Fechados pela equipe')).toHaveText('1');
    await expect(stat(page, 'Sem origem')).toHaveText('0');
    await expect(stat(page, 'Fora do horário comercial')).toHaveText('0');
    await expect(page.getByText(/das 8h às 17h/).first()).toBeAttached();
    await expect(page.getByText(/8h às 18h/)).toHaveCount(0);
  });

  test('trocar o funil vale para o painel inteiro', async ({ page, request }) => {
    await open(page, request);
    await expect(kpi(page, 'Conversas')).toHaveText('5');
    await page.getByRole('navigation', { name: 'Funil' }).getByRole('button', { name: 'Pedido em análise' }).click();
    await expect(kpi(page, 'Conversas')).toHaveText('1');
    await expect(kpi(page, 'Contratos assinados')).toHaveText('1');
    await page.getByRole('navigation', { name: 'Funil' }).getByRole('button', { name: 'Auxílio Acidente 7035' }).click();
    await expect(kpi(page, 'Conversas')).toHaveText('4');
  });

  test('periodo "Hoje" e "Ontem"', async ({ page, request }) => {
    await open(page, request);
    await page.getByRole('button', { name: 'Hoje', exact: true }).click();
    await expect(kpi(page, 'Conversas')).toHaveText('2');
    await page.getByRole('button', { name: 'Ontem', exact: true }).click();
    await expect(kpi(page, 'Conversas')).toHaveText('1');
  });

  test('periodo e funil ficam salvos no navegador', async ({ page, request }) => {
    await open(page, request);
    // O primeiro "7 dias" e o do periodo; o outro e o do grafico de chats.
    await page.getByRole('button', { name: '7 dias', exact: true }).first().click();
    await page.getByRole('navigation', { name: 'Funil' }).getByRole('button', { name: 'Pedido em análise' }).click();
    await page.reload();
    await expect(page.getByText(/Pedido em análise · 7 dias/).first()).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Funil' }).locator('button.font-semibold')).toHaveText('Pedido em análise');
  });

  test('filtro de responsavel', async ({ page, request }) => {
    await open(page, request);
    await page.getByLabel('Responsável').selectOption('2');
    await expect(kpi(page, 'Conversas')).toHaveText('1');
    await expect(kpi(page, 'Contratos assinados')).toHaveText('1');
  });

  test('erro no servidor cai no plano B (navegador) e continua mostrando numeros', async ({ page, request }) => {
    await resetFake(request, { scenario: 'dashboard' });
    await failNext(request, 'GET', '/dashboard_ia', 500);
    await page.goto('/app/accounts/1/dashboard-ia');
    await expect(kpi(page, 'Conversas')).toHaveText('5');
    // Sem historico: so quem esta em contrato assinado agora conta.
    await expect(kpi(page, 'Contratos assinados')).toHaveText('2');
    const { log } = await fakeState(request);
    expect(log.some(l => l.path.endsWith('/conversations'))).toBe(true);
  });

  test('servidor e plano B fora: mensagem e "Tentar de novo"', async ({ page, request }) => {
    await resetFake(request, { scenario: 'dashboard' });
    await failNext(request, 'GET', '/dashboard_ia', 500);
    await failNext(request, 'GET', '/conversations', 500, 4);
    await page.goto('/app/accounts/1/dashboard-ia');
    await expect(page.getByText('Não deu para montar o painel.')).toBeVisible();
    await page.getByRole('button', { name: 'Tentar de novo' }).click();
    await expect(kpi(page, 'Conversas')).toHaveText('5');
  });
});

test.describe('Permissoes e contas', () => {
  test('agente nao abre o Dashboard IA (rota so de administrador)', async ({ page, request }) => {
    await open(page, request, { role: 'agent' });
    await expect(page).toHaveURL(/\/app\/accounts\/1\/dashboard$/);
    await expect(page.getByTestId('home')).toBeVisible();
    const { log } = await fakeState(request);
    expect(log.some(l => l.path.includes('dashboard_ia'))).toBe(false);
  });

  test('conta parceira (F&P) ve so o funil dela e comeca sem meta', async ({ page, request }) => {
    await resetFake(request, { scenario: 'parceira', accountId: 3 });
    await page.goto('/app/accounts/3/dashboard-ia');
    await expect(kpi(page, 'Conversas')).toHaveText('2');
    await expect(kpi(page, 'Contratos assinados')).toHaveText('1');
    const tabs = page.getByRole('navigation', { name: 'Funil' }).getByRole('button');
    await expect(tabs).toHaveText(['Todos os funis', 'Auxílio Acidente']);
    await expect(page.getByRole('button', { name: 'Definir meta deste funil' })).toBeVisible();
    const { log } = await fakeState(request);
    const call = log.find(l => l.path.endsWith('/dashboard_ia'));
    expect(call.query).toBe('?inbox_ids%5B%5D=16');
  });
});
