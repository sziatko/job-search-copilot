import path from 'node:path';
import { config as loadEnv } from 'dotenv';

// The API runs standalone on the host (`nest start`, `node dist/main.js`), so it
// loads the monorepo-root .env itself. The production image has no .env (compose
// injects the vars); in the dev stack the file exists, but dotenv never overrides an
// already-set var.
// Imported purely for its side effect, as the very first import of the entrypoint —
// before AppModule, so ConfigModule's validation sees a populated process.env.
// `__dirname` is <root>/apps/api/{src,dist}, so ../../../.env is the repo root in
// both the compiled build and the swc-transpiled test run.
loadEnv({ path: path.resolve(__dirname, '../../../.env') });
