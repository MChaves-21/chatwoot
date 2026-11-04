/**
 * Liga o Chatwoot falso no lugar do `window.axios` do dashboard e coloca a
 * URL da pagina dentro da conta (o ApiClient tira o account id do pathname).
 */
import { createFakeChatwoot } from './fakeChatwoot';

export const SESSION = {
  'access-token': 'token-de-teste',
  client: 'cliente-de-teste',
  uid: 'admin@teste.local',
};

export function useFakeChatwoot(
  seed = {},
  { path = 'kanban', latency = 0 } = {}
) {
  const fake = createFakeChatwoot(seed);
  const adapter = fake.axiosAdapter();
  const tracker = { inFlight: 0, maxInFlight: 0 };

  const wrap =
    fn =>
    (...args) => {
      tracker.inFlight += 1;
      tracker.maxInFlight = Math.max(tracker.maxInFlight, tracker.inFlight);
      const done = () => {
        tracker.inFlight -= 1;
      };
      const run = () => fn(...args);
      const p = latency
        ? new Promise(r => {
            setTimeout(r, latency);
          }).then(run)
        : run();
      return p.then(
        v => {
          done();
          return v;
        },
        e => {
          done();
          throw e;
        }
      );
    };

  window.axios = Object.fromEntries(
    Object.entries(adapter).map(([k, fn]) => [k, wrap(fn)])
  );
  window.history.replaceState(
    {},
    '',
    `/app/accounts/${fake.state.accountId}/${path}`
  );
  document.cookie = `cw_d_session_info=${encodeURIComponent(
    JSON.stringify(SESSION)
  )}; path=/`;
  return { fake, tracker };
}

export function clearSessionCookie() {
  document.cookie =
    'cw_d_session_info=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/';
}

/** fetch falso: `handler(url, init)` devolve { status, body } ou lanca. */
export function mockFetch(handler) {
  const calls = [];
  const fn = vi.fn(async (url, init = {}) => {
    const body = init.body ? JSON.parse(init.body) : null;
    calls.push({ url, body });
    const r = await handler(url, body);
    const status = r.status ?? 200;
    let text = r.text;
    if (text === undefined)
      text = r.body === undefined ? '' : JSON.stringify(r.body);
    return {
      ok: status >= 200 && status < 300,
      status,
      text: async () => text,
      json: async () => JSON.parse(text),
    };
  });
  global.fetch = fn;
  return { fn, calls };
}
