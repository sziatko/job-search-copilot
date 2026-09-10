import path from 'node:path';
import { loadEnv } from 'vite';
import { defineConfig } from 'vitest/config';

// mode: 'test' -> Vite/Vitest convention for loading .env + .env.test (test wins on conflicts)
// from the monorepo root, so DATABASE_URL points at job_search_copilot_test, not the dev DB.
const rootDir = path.resolve(import.meta.dirname, '../..');

export default defineConfig({
  test: {
    name: 'core',
    environment: 'node',
    env: loadEnv('test', rootDir, ''),
    include: ['src/**/*.spec.ts'],
    setupFiles: ['./tests/setup.ts'],
  },
});
