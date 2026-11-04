/**
 * Servidor do E2E: Vite servindo o harness (harness/) com o Chatwoot falso
 * como middleware em /api. Rodar a partir da RAIZ do repositorio (os aliases
 * e o Tailwind resolvem caminhos pelo diretorio atual):
 *
 *   npx vite --config tests/goncalves-e2e/vite.config.mjs
 *
 * Controle do servidor falso (so para os testes):
 *   POST /__fake/reset  { scenario, role, accountId }
 *   POST /__fake/fail   { method, path, status, times }
 *   GET  /__fake/state
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { aliases, vueOptions } from '../../vite.shared.ts';
import { buildFake } from './scenarios.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '../..');
// PostCSS/Tailwind do proprio repositorio (o root do Vite aqui e esta pasta,
// e a busca automatica pelo postcss.config.js nao sobe ate a raiz).
const requireRepo = createRequire(path.join(repo, 'package.json'));
const postcss = {
  plugins: [
    requireRepo('postcss-import'),
    requireRepo('tailwindcss')({ config: path.join(repo, 'tailwind.config.js') }),
    requireRepo('autoprefixer'),
  ],
};

let fake = buildFake();

const readBody = req =>
  new Promise(resolve => {
    let raw = '';
    req.on('data', c => {
      raw += c;
    });
    req.on('end', () => {
      try {
        resolve(raw ? JSON.parse(raw) : null);
      } catch (e) {
        resolve(null);
      }
    });
  });

const json = (res, status, data) => {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(data));
};

function fakeChatwoot() {
  return {
    name: 'fake-chatwoot',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = req.url || '';
        if (url.startsWith('/__fake/')) {
          const body = await readBody(req);
          if (url === '/__fake/reset') {
            fake = buildFake(body || {});
            return json(res, 200, { ok: true });
          }
          if (url === '/__fake/fail') {
            fake.failNext(body.method, body.path, body.status || 500, body.times || 1);
            return json(res, 200, { ok: true });
          }
          if (url === '/__fake/state') {
            const { conversations, messages, accountAttributes, log } = fake.state;
            return json(res, 200, { conversations, messages, accountAttributes, log });
          }
          return json(res, 404, {});
        }
        if (url.startsWith('/api/')) {
          const body = ['POST', 'PATCH', 'PUT'].includes(req.method) ? await readBody(req) : null;
          const out = fake.handle({ method: req.method, url, body });
          return json(res, out.status, out.data);
        }
        // SPA: qualquer /app/... devolve o harness.
        if (url.startsWith('/app/') && req.method === 'GET') {
          const html = readFileSync(path.join(here, 'harness/index.html'), 'utf8');
          const out = await server.transformIndexHtml(url, html, '/harness/index.html');
          res.setHeader('Content-Type', 'text/html');
          return res.end(out);
        }
        return next();
      });
    },
  };
}

export default defineConfig({
  root: here,
  plugins: [vue(vueOptions), fakeChatwoot()],
  resolve: { alias: aliases },
  css: {
    postcss,
    preprocessorOptions: { scss: { api: 'modern-compiler' } },
  },
  server: {
    port: Number(process.env.E2E_PORT || 5199),
    strictPort: true,
    fs: { allow: [repo] },
  },
  optimizeDeps: {
    entries: [path.join(here, 'harness/main.js')],
  },
  logLevel: 'warn',
});
