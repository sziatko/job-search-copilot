import { existsSync } from 'node:fs';
import path from 'node:path';
import { defineConfig, devices } from '@playwright/test';
import { VISUAL_NOW, visualRun } from './clock';
import { env } from './db';

// ADR-0037. Locally the vars come from .env.e2e (gitignored, fake values); CI sets them
// itself. A variable already set is never overridden, as with vitest's .env.test.
const root = path.resolve(__dirname, '..');
const envFile = path.join(root, '.env.e2e');
if (existsSync(envFile)) process.loadEnvFile(envFile);

const apiOrigin = env('BETTER_AUTH_URL'); // :3100, not the dev stack's :3000
const webOrigin = env('WEB_ORIGIN'); // :5174, not :5173
// A visual run's api lives at VISUAL_NOW, as its seed does (clock.ts).
const apiClock = visualRun ? '--import ./e2e/shifted-clock.mjs ' : '';

export default defineConfig({
  testDir: '.',
  globalSetup: './global-setup.ts',
  workers: 1, // one database, reset before each test
  forbidOnly: !!process.env.CI,
  reporter: [['list'], ['html', { open: 'never' }]],
  // Each test's first page load is vite dev, unbundled, in a fresh context: ~3–4 s here
  // before the first assertion can pass, so the default 5 s failed once under load.
  expect: { timeout: 10_000 },
  use: {
    baseURL: webOrigin,
    storageState: path.join(__dirname, '.auth', 'state.json'), // written by global setup
    trace: 'retain-on-failure',
  },
  // The visual run (visual.spec.ts, in the Playwright image only) is a run of its own:
  // its api and seed live at VISUAL_NOW, which would move every other spec's dates.
  projects: visualRun
    ? [
        {
          name: 'desktop',
          use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
        },
        {
          name: 'phone',
          use: {
            ...devices['Desktop Chrome'],
            viewport: { width: 390, height: 844 },
            isMobile: true,
            hasTouch: true,
          },
        },
        // A full-page screenshot is taken until two in a row match: slower than an assertion.
      ].map((project) => ({ ...project, testMatch: 'visual.spec.ts', timeout: 60_000 }))
    : [
        { name: 'chromium', testIgnore: 'visual.spec.ts', use: { ...devices['Desktop Chrome'] } },
        // The README's screenshots (screenshots.ts): only under `npm run screenshots`, so
        // `npm run test:e2e` and CI never take them.
        ...(process.env.npm_lifecycle_event === 'screenshots'
          ? [
              {
                name: 'screenshots',
                testMatch: 'screenshots.ts',
                use: { ...devices['Desktop Chrome'] },
              },
            ]
          : []),
      ],
  webServer: [
    {
      // Built to e2e/.api, not apps/api/dist: the dev stack's `nest start --watch` owns
      // that folder. From there, load-env.ts finds no .env, so dev values never leak in.
      command: `npx tsx e2e/prepare-db.ts && npx tsc -p apps/api/tsconfig.build.json --outDir e2e/.api --declaration false && node ${apiClock}e2e/.api/main.js`,
      cwd: root,
      url: `${apiOrigin}/health`,
      env: { API_PORT: new URL(apiOrigin).port, E2E_NOW: VISUAL_NOW.toISOString() },
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
