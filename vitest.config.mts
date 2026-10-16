import { defineConfig } from 'vitest/config';

// A single entry point that fans out to each workspace's own vitest.config.ts.
// `npm test` from the repo root runs all of them; each project keeps its own
// environment (node vs jsdom) and setup files.
export default defineConfig({
  test: {
    projects: ['packages/core', 'apps/api', 'apps/mcp', 'apps/web'],
    // core/api/mcp's integration tests all hit the same job_search_copilot_test
    // database and clean up with a blanket deleteMany() in afterEach. Running
    // their files in parallel lets one file's cleanup wipe rows another file
    // is mid-assertion on. The suite is small enough that running sequentially
    // (instead of, say, wrapping every test in its own rolled-back transaction)
    // is the cheaper fix.
    fileParallelism: false,
    // Each project also sets `isolate: false` in its own config (file-based
    // projects don't inherit it from here): one environment and module cache per
    // project instead of a fresh jsdom/import per file — about 40% faster. The cost:
    // state leaks between files, so a test that fails in the full run but passes
    // alone is the first thing to suspect. (Running web in parallel instead is slower
    // on a 2-core machine, with timeouts.)
  },
});
