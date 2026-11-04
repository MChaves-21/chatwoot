import { expect } from '@playwright/test';

/** Recria o Chatwoot falso com um cenario (ver scenarios.mjs). */
export async function resetFake(request, opts) {
  const res = await request.post('/__fake/reset', { data: opts });
  expect(res.ok()).toBeTruthy();
}

export async function failNext(request, method, path, status = 500, times = 1) {
  await request.post('/__fake/fail', { data: { method, path, status, times } });
}

export async function fakeState(request) {
  return (await request.get('/__fake/state')).json();
}

export const conversation = async (request, id) =>
  (await fakeState(request)).conversations.find(c => c.id === id);

/** Erros de console/pagina viram falha do teste no fim (afterEach). */
export function watchErrors(page) {
  const errors = [];
  page.on('pageerror', e => errors.push(`pageerror: ${e.message}`));
  page.on('console', m => {
    if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) {
      errors.push(`console: ${m.text()}`);
    }
  });
  return errors;
}

/** Coluna do Kanban pelo titulo exato. */
export const column = (page, title) =>
  page
    .locator('div.min-w-\\[290px\\]')
    .filter({ has: page.locator(`span[title="${title}"]`) });

export const card = (page, columnTitle, name) =>
  column(page, columnTitle).locator('[draggable="true"]').filter({ hasText: name });

export const columnCount = (page, title) =>
  column(page, title).locator('span.rounded-full').first();

export const toast = page => page.getByTestId('toast').last();

/**
 * Arrasta por eventos HTML5 (dragstart -> dragenter/dragover/drop -> dragend).
 * Para colunas fora da tela: com 15 colunas o quadro rola na horizontal, e o
 * `dragTo` do mouse tira o card de vista ao rolar ate o destino.
 */
export async function dragByEvents(page, from, to) {
  const source = await from.elementHandle();
  const target = await to.elementHandle();
  await page.evaluate(
    ([s, t]) => {
      const dt = new DataTransfer();
      const fire = (el, type) =>
        el.dispatchEvent(new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer: dt }));
      fire(s, 'dragstart');
      fire(t, 'dragenter');
      fire(t, 'dragover');
      fire(t, 'drop');
      fire(s, 'dragend');
    },
    [source, target]
  );
}
