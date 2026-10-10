import { existsSync } from 'node:fs';
import { defineConfig } from '@playwright/test';

const chromiumPath = '/repl/tools/bin/chromium';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:4174',
    browserName: 'chromium',
    launchOptions: {
      ...(existsSync(chromiumPath) ? { executablePath: chromiumPath } : {}),
      args: ['--no-sandbox'],
    },
  },
  webServer: {
    command: 'pnpm --filter @workspace/listen-first run dev -- --port 4174',
    url: 'http://127.0.0.1:4174',
    env: { PORT: '4174', BASE_PATH: '/' },
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
