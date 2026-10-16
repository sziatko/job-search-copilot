import path from 'node:path';
import { loadEnv } from 'vite';
import { defineConfig } from 'vitest/config';

const rootDir = path.resolve(import.meta.dirname, '../..');

export default defineConfig({
  test: {
    name: 'mcp',
    environment: 'node',
    env: loadEnv('test', rootDir, ''),
    include: ['src/**/*.spec.ts'],
    setupFiles: [path.join(rootDir, 'vitest.test-db.ts')],
    isolate: false, // see the root vitest.config.mts
  },
});
