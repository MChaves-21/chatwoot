/**
 * Relatorio da Equipe e Disparador — ponta a ponta.
 *
 * O Disparador fala com o n8n (webhook externo): aqui o webhook e
 * interceptado no navegador (page.route), e o teste confere o que a tela
 * mandou para ele.
 */
import { test, expect } from '@playwright/test';
import { fakeState, resetFake, watchErrors } from './helpers.mjs';

const NOW = new Date('2026-11-04T15:00:00Z');
const N8N_DISPARADOR = 'https://n8n.goncalvesesilva.cloud/webhook/disparador-api';
const SESSION = { 'access-token': 'tok-e2e', client: 'cli-e2e', uid: 'admin@teste.local' };

let errors = [];
test.beforeEach(async ({ page, context, baseURL }) => {
  errors = watchErrors(page);
  await page.clock.setFixedTime(NOW);
  await context.addCookies([
    { name: 'cw_d_session_info', value: encodeURIComponent(JSON.stringify(SESSION)), url: baseURL },
  ]);
});
test.afterEach(() => {
  expect(errors, 'erros no console do navegador').toEqual([]);
});

const kpi = (page, label) =>
  page.locator(`span:text-is("${label}") + span`).first();

test.describe('Relatorio da Equipe', () => {
  test('administrador ve os totais do periodo (7 dias por padrao)', async ({ page, request }) => {
    await resetFake(request, { scenario: 'relatorio' });
    await page.goto('/app/accounts/1/relatorio-equipe');
    await expect(page.getByRole('heading', { name: 'Mensagens e conversas por usuário' })).toBeVisible();
    await expect(kpi(page, 'Recebidas do cliente')).toHaveText('2');
    await expect(kpi(page, 'Enviadas')).toHaveText('3');
    await expect(page.getByText('equipe 100% · IA 0%')).toBeVisible();
    const { log } = await fakeState(request);
    const call = log.find(l => l.path.endsWith('/relatorio_equipe'));
    expect(call.query).toContain('since=2026-10-29');
    expect(call.query).toContain('until=2026-11-04');
    expect(call.query).toContain('tz=America%2FFortaleza');
  });

  test('"Quem conta como IA" grava para todos e muda a conta', async ({ page, request }) => {
    await resetFake(request, { scenario: 'relatorio' });
    await page.goto('/app/accounts/1/relatorio-equipe');
    await expect(kpi(page, 'Enviadas')).toHaveText('3');
    await page.getByRole('button', { name: 'Quem conta como IA' }).click();
    await page.getByLabel('Juliana IA').check();
    await page.getByRole('button', { name: 'Salvar' }).click();
    await expect(page.getByText('equipe 33% · IA 67%')).toBeVisible();
    const { accountAttributes } = await fakeState(request);
    expect(accountAttributes.relatorio_equipe_ia_users).toEqual([3]);
  });

  test('periodo "Hoje" pede so o dia', async ({ page, request }) => {
    await resetFake(request, { scenario: 'relatorio' });
    await page.goto('/app/accounts/1/relatorio-equipe');
    await expect(kpi(page, 'Recebidas do cliente')).toHaveText('2');
    await page.getByRole('button', { name: 'Hoje', exact: true }).click();
    await expect(kpi(page, 'Recebidas do cliente')).toHaveText('1');
  });

  test('agente nao abre o relatorio', async ({ page, request }) => {
    await resetFake(request, { scenario: 'relatorio', role: 'agent' });
    await page.goto('/app/accounts/1/relatorio-equipe');
    await expect(page).toHaveURL(/\/app\/accounts\/1\/dashboard$/);
    const { log } = await fakeState(request);
    expect(log.some(l => l.path.includes('relatorio_equipe'))).toBe(false);
  });
});

test.describe('Disparador', () => {
  test('lista os envios do n8n com progresso, mandando a sessao do Chatwoot', async ({ page, request }) => {
    await resetFake(request, { scenario: 'vazio' });
    const bodies = [];
    await page.route(N8N_DISPARADOR, async route => {
      bodies.push(JSON.parse(route.request().postData()));
      await route.fulfill({
        json: {
          ok: true,
          campanhas: [
            {
              id: 7,
              nome: 'Retomada BPC',
              criado_por: 'Karol',
              inbox_nome: 'BPC API COEX',
              status: 'agendada',
              total: 10,
              contagem: { enviado: 4, erro: 1, pendente: 5 },
              inicio: '2026-11-04T12:00:00Z',
            },
          ],
        },
      });
    });
    await page.goto('/app/accounts/1/disparador');
    await expect(page.getByRole('heading', { name: 'O que você quer fazer?' })).toBeVisible();
    const row = page.locator('tr').filter({ hasText: 'Retomada BPC' });
    await expect(row).toContainText('4 de 10 enviadas');
    await expect(row).toContainText('1 erro(s)');
    await expect(row).toContainText('Em andamento');
    expect(bodies[0]).toEqual({ acao: 'listar', auth: SESSION });
  });

  test('recusa do n8n aparece para o usuario', async ({ page, request }) => {
    await resetFake(request, { scenario: 'vazio' });
    await page.route(N8N_DISPARADOR, route =>
      route.fulfill({ status: 403, json: { ok: false, error: 'Só administradores podem disparar.' } })
    );
    await page.goto('/app/accounts/1/disparador');
    await expect(page.getByText('Só administradores podem disparar.')).toBeVisible();
  });

  test('sem envios: mostra o convite para comecar', async ({ page, request }) => {
    await resetFake(request, { scenario: 'vazio' });
    await page.route(N8N_DISPARADOR, route => route.fulfill({ json: { ok: true, campanhas: [] } }));
    await page.goto('/app/accounts/1/disparador');
    await expect(page.getByText('Nenhum envio ainda.')).toBeVisible();
    await page.getByRole('button', { name: /Mandar para uma pessoa/ }).click();
    await expect(page.getByRole('heading', { name: 'Mandar para uma pessoa' })).toBeVisible();
  });

  test('agente nao abre o Disparador e o n8n nem e chamado', async ({ page, request }) => {
    await resetFake(request, { scenario: 'vazio', role: 'agent' });
    let called = false;
    await page.route(N8N_DISPARADOR, route => {
      called = true;
      return route.fulfill({ json: { ok: true, campanhas: [] } });
    });
    await page.goto('/app/accounts/1/disparador');
    await expect(page).toHaveURL(/\/app\/accounts\/1\/dashboard$/);
    expect(called).toBe(false);
  });
});
