import { defineConfig } from 'vitest/config';

// A single entry point that fans out to each workspace's own vitest.config.mts.
// `npm test` from the repo root runs all of them; each project keeps its own
// environment (node vs jsdom) and setup files.
export default defineConfig({
  test: {
    projects: ['packages/core', 'apps/api', 'apps/mcp', 'apps/web'],
    // Files run in parallel (Vitest's default), the DB-backed ones too: they share
    // job_search_copilot_test, but each test deletes only the users it made and reads
    // only their rows (ADR-0015). A test that wipes or counts a whole table breaks a
    // file running beside it.
    // Each project also sets `isolate: false` in its own config (file-based
    // projects don't inherit it from here): one environment and module cache per
    // worker instead of a fresh jsdom/import per file — about 40% faster. The cost:
    // state leaks between files, so a test that fails in the full run but passes
    // alone is the first thing to suspect.
  },
});
