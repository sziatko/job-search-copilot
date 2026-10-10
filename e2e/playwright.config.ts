import { existsSync } from 'node:fs';
import path from 'node:path';
import { defineConfig, devices } from '@playwright/test';
import { env } from './db';

// ADR-0037. Locally the vars come from .env.e2e (gitignored, fake values); CI sets them
// itself. A variable already set is never overridden, as with vitest's .env.test.
const root = path.resolve(__dirname, '..');
const envFile = path.join(root, '.env.e2e');
if (existsSync(envFile)) process.loadEnvFile(envFile);

const apiOrigin = env('BETTER_AUTH_URL'); // :3100, not the dev stack's :3000
const webOrigin = env('WEB_ORIGIN'); // :5174, not :5173

export default defineConfig({
  testDir: '.',
  globalSetup: './global-setup.ts',
  workers: 1, // one database, reset before each test
  forbidOnly: !!process.env.CI,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: webOrigin,
    storageState: path.join(__dirname, '.auth', 'state.json'), // written by global setup
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      // Built to e2e/.api, not apps/api/dist: the dev stack's `nest start --watch` owns
      // that folder. From there, load-env.ts finds no .env, so dev values never leak in.
      command:
        'npx tsx e2e/prepare-db.ts && npx tsc -p apps/api/tsconfig.build.json --outDir e2e/.api --declaration false && node e2e/.api/main.js',
      cwd: root,
      url: `${apiOrigin}/health`,
      env: { API_PORT: new URL(apiOrigin).port },
      timeout: 180_000,
    },
    {
      command: `npm run dev --workspace=@job-search-copilot/web -- --port ${new URL(webOrigin).port}`,
      cwd: root,
      url: webOrigin,
      env: { VITE_API_URL: apiOrigin },
    },
  ],
});
