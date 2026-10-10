import path from 'node:path';
import swc from 'unplugin-swc';
import { loadEnv } from 'vite';
import { defineConfig } from 'vitest/config';

// NestJS decorators (@Controller, @Injectable, ...) rely on `emitDecoratorMetadata`,
// which esbuild (Vitest's default TS transform) doesn't support. SWC does, and is
// the transform NestJS's own docs recommend for Vitest — see https://docs.nestjs.com/recipes/swc#jest
const rootDir = path.resolve(import.meta.dirname, '../..');

export default defineConfig({
  plugins: [swc.vite()],
  // The web's own alias, so test/contract.e2e.spec.ts imports the web's zod schemas as
  // they are (their files import `@/lib/api`). Vitest only: tsconfig.build.json leaves
  // test/ out, so the typecheck never pulls the web's DOM files into api.
  resolve: { alias: { '@': path.resolve(rootDir, 'apps/web/src') } },
  test: {
    name: 'api',
    environment: 'node',
    env: loadEnv('test', rootDir, ''),
    include: ['src/**/*.spec.ts', 'test/**/*.spec.ts'],
    isolate: false, // see the root vitest.config.mts
    // A raised limit, not a fix: no cause found (2026-10-10, docs/backlog.md). The
    // first file's beforeAll pays the cold start — Nest loading express, Prisma's
    // first query compile, the first connections — ~1 s quiet, 3 s at worst measured,
    // nothing hanging; yet one full run under load went past Vitest's 10 s.
    hookTimeout: 30_000,
  },
});
