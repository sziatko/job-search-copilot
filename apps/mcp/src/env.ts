import path from 'node:path';
import { config as loadEnv } from 'dotenv';

// The MCP server runs standalone (tsx / node), so it loads the monorepo-root .env
// itself rather than relying on @job-search-copilot/core to do it. In Docker,
// DATABASE_URL is already injected and dotenv won't override an existing var.
// Imported for its side effect as the very first import of the entrypoint.
loadEnv({ path: path.resolve(__dirname, '../../../.env') });
