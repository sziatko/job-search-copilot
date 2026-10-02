import path from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, 'src'),
    },
  },
  test: {
    name: 'web',
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    isolate: false, // see the root vitest.config.mts
    // Every page test boots the whole router in jsdom, which is CPU-bound: the
    // heaviest take 2–5 s on a quiet machine, and this machine has run the suite up
    // to 4× slower (85 s vs 372 s). Vitest's 5 s left about 2× headroom, so under
    // load any mid-weight test timed out. Profiled 2026-09-29, docs/backlog.md.
    testTimeout: 20_000,
  },
});
