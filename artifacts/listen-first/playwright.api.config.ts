import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { defineConfig } from '@playwright/test';
import browserConfig from './playwright.config';

const fixture = process.env.TEST_APPROVED_PDF;
if (!fixture || !existsSync(path.resolve(fixture))) {
  throw new Error('Set TEST_APPROVED_PDF to an existing original approved PDF. This smoke test never substitutes synthetic PDF bytes.');
}

const clockFile = path.resolve(import.meta.dirname, '../../generated-artifacts/study-api-clock.json');
mkdirSync(path.dirname(clockFile), { recursive: true });
writeFileSync(clockFile, 'null');

export default defineConfig({
  ...browserConfig,
  testIgnore: [],
  testMatch: '**/real-study-api.spec.ts',
  workers: 1,
  use: { ...browserConfig.use, baseURL: 'http://127.0.0.1:4176' },
  webServer: [
    {
      command: 'pnpm --filter @workspace/api-server run build && node --import ./e2e/api-test-clock.mjs ../api-server/dist/index.mjs',
      url: 'http://127.0.0.1:4175/api/study/demo',
      // Never reuse a normal server that might have paid-provider credentials.
      reuseExistingServer: false,
      env: {
        PORT: '4175', NODE_ENV: 'development', OPENAI_API_KEY: '', GEMINI_API_KEY: '',
        SESSION_SECRET: 'isolated-study-api-test-only',
        STUDY_TEST_CLOCK_FILE: clockFile,
      },
      timeout: 120_000,
    },
    {
      command: 'pnpm exec vite --config e2e/vite.study-api.config.ts',
      url: 'http://127.0.0.1:4176',
      reuseExistingServer: false,
      env: { PORT: '4176', BASE_PATH: '/' },
      timeout: 120_000,
    },
  ],
});
