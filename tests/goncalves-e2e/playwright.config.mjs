import { defineConfig, devices } from '@playwright/test';

const PORT = Number(process.env.E2E_PORT || 5199);

export default defineConfig({
  testDir: './specs',
  timeout: 60 * 1000,
  expect: { timeout: 10 * 1000 },
  // O servidor falso e um so: os testes rodam em serie.
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI
    ? [['list'], ['github'], ['html', { open: 'never', outputFolder: 'relatorio' }]]
    : [['list']],
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    viewport: { width: 1600, height: 1000 },
    locale: 'pt-BR',
    timezoneId: 'America/Fortaleza',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1600, height: 1000 } } }],
  webServer: {
    // A partir da raiz do repositorio: aliases e Tailwind usam o diretorio atual.
    command: `npx vite --config tests/goncalves-e2e/vite.config.mjs --port ${PORT}`,
    cwd: '../..',
    url: `http://localhost:${PORT}/api/v1/profile`,
    reuseExistingServer: !process.env.CI,
    timeout: 120 * 1000,
  },
});
