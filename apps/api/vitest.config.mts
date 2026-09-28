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
  test: {
    name: 'api',
    environment: 'node',
    env: loadEnv('test', rootDir, ''),
    include: ['src/**/*.spec.ts', 'test/**/*.spec.ts'],
    isolate: false, // see the root vitest.config.mts
  },
});
