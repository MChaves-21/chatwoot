/**
 * Kanban — ponta a ponta: a tela real do fork no navegador, falando com o
 * Chatwoot falso. Cada teste confere a TELA e o que ficou GRAVADO no servidor.
 */
import { test, expect } from '@playwright/test';
import {
  card,
  column,
  columnCount,
  conversation,
  dragByEvents,
  failNext,
  fakeState,
  resetFake,
  toast,
  watchErrors,
} from './helpers.mjs';

let errors = [];
test.beforeEach(async ({ page }) => {
  errors = watchErrors(page);
});
test.afterEach(() => {
  expect(errors, 'erros no console do navegador').toEqual([]);
});

const open = async (page, request, opts = {}) => {
  await resetFake(request, { scenario: 'kanban', ...opts });
  await page.goto(`/app/accounts/${opts.accountId || 1}/kanban`);
  await expect(page.getByText(/^Atualizado /)).toBeVisible();
};

test.describe('Quadro do Auxilio Acidente (caixa 6)', () => {
  test('abre no primeiro funil com todas as colunas e contagens', async ({ page, request }) => {
    await open(page, request);
    await expect(page.getByRole('button', { name: 'Auxílio Acidente 7035' })).toHaveAttribute('aria-pressed', 'true');
    for (const [title, n] of [
      ['Sem etapa', '1'],
      ['SDR', '2'],
      ['Comercial', '1'],
      ['Contrato Assinado', '1'],
      ['Desqualificado', '1'],
      ['Efetivado', '0'],
    ]) {
      await expect(columnCount(page, title), title).toHaveText(n);
    }
    await expect(column(page, 'Efetivado')).toContainText('Nenhuma conversa');
  });

  test('conversa de outra caixa nao aparece, mesmo com a etiqueta do funil', async ({ page, request }) => {
    await open(page, request);
    await expect(page.getByText('Gil BPC')).toHaveCount(0);
  });

  test('"Sem etapa" mostra quem nao tem etapa (26/10/2026)', async ({ page, request }) => {
    await open(page, request);
    await expect(card(page, 'Sem etapa', 'Elisa Prado')).toBeVisible();
  });

  test('descarte vence: sdr + desqualificado aparece so em Desqualificado', async ({ page, request }) => {
    await open(page, request);
    await expect(card(page, 'Desqualificado', 'Davi Rocha')).toBeVisible();
    await expect(card(page, 'SDR', 'Davi Rocha')).toHaveCount(0);
  });

  test('card mostra nome, telefone, tag, nao lidas e link da conversa', async ({ page, request }) => {
    await open(page, request);
    const c = card(page, 'SDR', 'Bruno Lima');
    await expect(c).toContainText('+5585995270002');
    await expect(c).toContainText('Urgente');
    await expect(c).toContainText('#102');
    await expect(c.getByText('2', { exact: true })).toBeVisible();
    await expect(c.getByRole('link', { name: 'abrir' })).toHaveAttribute('href', /\/app\/accounts\/1\/conversations\/102/);
  });
});

test.describe('Arrastar e soltar', () => {
  test('SDR -> Comercial grava a etapa, mantem a tag e marca `manual`', async ({ page, request }) => {
    await open(page, request);
    await card(page, 'SDR', 'Bruno Lima').dragTo(column(page, 'Comercial'));
    await expect(toast(page)).toHaveText('Movido para "Comercial"');
    await expect(card(page, 'Comercial', 'Bruno Lima')).toBeVisible();
    await expect(card(page, 'SDR', 'Bruno Lima')).toHaveCount(0);
    await expect(columnCount(page, 'SDR')).toHaveText('1');
    await expect(columnCount(page, 'Comercial')).toHaveText('2');
    const conv = await conversation(request, 102);
    expect(conv.labels.sort()).toEqual(['comercial', 'manual', 'urgente']);
  });

  test('para Desqualificado: desliga o robo e resolve a conversa', async ({ page, request }) => {
    await open(page, request);
    await dragByEvents(page, card(page, 'SDR', 'Ana Ercília'), column(page, 'Desqualificado'));
    await expect(toast(page)).toHaveText('Movido para "Desqualificado"');
    const conv = await conversation(request, 101);
    expect(conv.labels.sort()).toEqual(['atendimento_humanizado', 'desqualificado', 'manual']);
    expect(conv.status).toBe('resolved');
    await expect(columnCount(page, 'Desqualificado')).toHaveText('2');
  });

  test('de volta para "Sem etapa" tira so a etapa', async ({ page, request }) => {
    await open(page, request);
    await card(page, 'Comercial', 'Carla Souza').dragTo(column(page, 'Sem etapa'));
    await expect(card(page, 'Sem etapa', 'Carla Souza')).toBeVisible();
    expect((await conversation(request, 103)).labels).toEqual(['manual']);
  });

  test('falha ao gravar: card volta e o atendente ve o erro', async ({ page, request }) => {
    await open(page, request);
    await failNext(request, 'POST', '/conversations/101/labels', 500);
    await card(page, 'SDR', 'Ana Ercília').dragTo(column(page, 'Comercial'));
    await expect(toast(page)).toContainText('Falha ao mover');
    await expect(card(page, 'SDR', 'Ana Ercília')).toBeVisible();
    await expect(card(page, 'Comercial', 'Ana Ercília')).toHaveCount(0);
    await expect(columnCount(page, 'SDR')).toHaveText('2');
    expect((await conversation(request, 101)).labels).toEqual(['sdr']);
  });

  test('etiqueta gravada mas encerramento falhou: avisa sem desfazer', async ({ page, request }) => {
    await open(page, request);
    await failNext(request, 'POST', '/conversations/101/toggle_status', 500);
    await dragByEvents(page, card(page, 'SDR', 'Ana Ercília'), column(page, 'Descarte (SDR)'));
    await expect(toast(page)).toContainText('nao consegui encerrar');
    await expect(card(page, 'Descarte (SDR)', 'Ana Ercília')).toBeVisible();
    const conv = await conversation(request, 101);
    expect(conv.labels).toContain('descarte_sdr');
    expect(conv.status).toBe('open');
  });

  test('soltar na mesma coluna nao chama o servidor', async ({ page, request }) => {
    await open(page, request);
    const before = (await fakeState(request)).log.length;
    await card(page, 'SDR', 'Ana Ercília').dragTo(column(page, 'SDR'));
    await page.waitForTimeout(300);
    const after = (await fakeState(request)).log.filter(l => l.method === 'POST');
    expect(after.slice(before)).toEqual([]);
  });
});

test.describe('Outros funis', () => {
  test('BPC le a caixa 15; etiqueta do Auxilio la vira "Sem etapa"', async ({ page, request }) => {
    await open(page, request);
    await page.getByRole('button', { name: 'Pedido em análise' }).click();
    await expect(page.getByRole('button', { name: 'Pedido em análise' })).toHaveAttribute('aria-pressed', 'true');
    await expect(card(page, 'Lead novo', 'Helena BPC')).toBeVisible();
    await expect(card(page, 'Sem etapa', 'Gil BPC')).toBeVisible();
    await expect(page.getByText('Ana Ercília')).toHaveCount(0);
  });

  test('o funil escolhido fica salvo para a proxima visita', async ({ page, request }) => {
    await open(page, request);
    await page.getByRole('button', { name: 'Trabalhista' }).click();
    await expect(card(page, 'Objecao', 'Lia Trab')).toBeVisible();
    await page.reload();
    await expect(page.getByRole('button', { name: 'Trabalhista' })).toHaveAttribute('aria-pressed', 'true');
    await expect(card(page, 'Objecao', 'Lia Trab')).toBeVisible();
  });

  test('0300: "So trafego" esconde importados no servidor', async ({ page, request }) => {
    await open(page, request);
    await page.getByRole('button', { name: 'Auxílio Acidente 0300' }).click();
    await expect(columnCount(page, 'SDR')).toHaveText('2');
    await expect(card(page, 'Sem etapa', 'Kleber Importado')).toBeVisible();
    await page.getByLabel(/Só tráfego/).check();
    await expect(columnCount(page, 'SDR')).toHaveText('1');
    await expect(card(page, 'SDR', 'Igor Trafego')).toBeVisible();
    await expect(page.getByText('Joana Importada')).toHaveCount(0);
    await expect(page.getByText('Kleber Importado')).toHaveCount(0);
    const filters = (await fakeState(request)).log.filter(l => l.path.endsWith('/conversations/filter'));
    expect(filters.length).toBeGreaterThan(0);
  });

  test('"So trafego" nao aparece nos funis sem importacao', async ({ page, request }) => {
    await open(page, request);
    await expect(page.getByLabel(/Só tráfego/)).toHaveCount(0);
  });
});

test.describe('Busca e filtros', () => {
  test('busca no servidor acha o contato nos dois funis', async ({ page, request }) => {
    await open(page, request);
    await page.getByPlaceholder('Buscar ou estado…').fill('Helena');
    await expect(page.getByText('1 resultado(s) nos dois funis')).toBeVisible();
    const hit = page.locator('li').filter({ hasText: 'Helena BPC' });
    await expect(hit).toContainText('BPC');
    await expect(hit).toContainText('Lead novo');
    await page.getByRole('button', { name: 'limpar' }).click();
    await expect(page.getByText('resultado(s) nos dois funis')).toHaveCount(0);
  });

  test('busca por telefone com mascara', async ({ page, request }) => {
    await open(page, request);
    await page.getByPlaceholder('Buscar ou estado…').fill('(85) 99527-0003');
    await expect(page.locator('li').filter({ hasText: 'Carla Souza' })).toBeVisible();
  });

  test('termo de estado filtra o que esta carregado, sem ir ao servidor', async ({ page, request }) => {
    await open(page, request);
    const before = (await fakeState(request)).log.length;
    await page.getByPlaceholder('Buscar ou estado…').fill('desqualificado');
    await expect(page.getByText(/Desqualificado — \d+ no quadro carregado/)).toBeVisible();
    const after = (await fakeState(request)).log.slice(before);
    expect(after.filter(l => l.path.includes('contacts/search'))).toEqual([]);
  });

  test('filtro por tag mostra "visiveis/total" e o badge conta 1', async ({ page, request }) => {
    await open(page, request);
    await page.getByRole('button', { name: 'Filtros' }).click();
    await page.locator('select').first().selectOption('urgente');
    await page.keyboard.press('Escape');
    await expect(page.getByRole('button', { name: 'Filtros (1)' })).toBeVisible();
    await expect(columnCount(page, 'SDR')).toHaveText('1/2');
    await expect(card(page, 'SDR', 'Ana Ercília')).toHaveCount(0);
  });
});

test.describe('Paginacao e contas', () => {
  test('"Ver mais" traz a proxima pagina de 25', async ({ page, request }) => {
    await resetFake(request, { scenario: 'kanbanVolume' });
    await page.goto('/app/accounts/1/kanban');
    const col = column(page, 'Comercial');
    await expect(columnCount(page, 'Comercial')).toHaveText('60');
    await expect(col.locator('[draggable="true"]')).toHaveCount(25);
    await col.getByRole('button', { name: 'Ver mais' }).click();
    await expect(col.locator('[draggable="true"]')).toHaveCount(50);
    await col.getByRole('button', { name: 'Ver mais' }).click();
    await expect(col.locator('[draggable="true"]')).toHaveCount(60);
    await expect(col.getByRole('button', { name: 'Ver mais' })).toHaveCount(0);
  });

  test('agente tambem usa o Kanban', async ({ page, request }) => {
    await open(page, request, { role: 'agent' });
    await expect(card(page, 'SDR', 'Ana Ercília')).toBeVisible();
  });

  test('Ferreira & Paiva (conta 3) ve so o funil dela, na caixa 16', async ({ page, request }) => {
    await resetFake(request, { scenario: 'parceira', accountId: 3 });
    await page.goto('/app/accounts/3/kanban');
    await expect(card(page, 'SDR', 'Lead FP')).toBeVisible();
    await expect(page.getByRole('group', { name: 'Funil' }).getByRole('button')).toHaveText(['Auxílio Acidente']);
    await expect(column(page, 'Sem etapa')).toHaveCount(0);
    await expect(page.getByText('Lead GS')).toHaveCount(0);
  });

  test('coluna com erro mostra a mensagem e as outras carregam', async ({ page, request }) => {
    await resetFake(request, { scenario: 'kanban' });
    await failNext(request, 'GET', 'labels%5B%5D=comercial', 500);
    await page.goto('/app/accounts/1/kanban');
    await expect(column(page, 'Comercial')).toContainText('Erro:');
    await expect(card(page, 'SDR', 'Ana Ercília')).toBeVisible();
    await page.getByRole('button', { name: 'Recarregar' }).click();
    await expect(card(page, 'Comercial', 'Carla Souza')).toBeVisible();
  });
});
