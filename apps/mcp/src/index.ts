// First: loads .env before anything else is evaluated.
import './env';
import { getPrisma, verifyApiKey } from '@job-search-copilot/core';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { stdioEnv } from './env';
import { createServer } from './server';

async function main() {
  const env = stdioEnv();
  // Identity, not security: whoever runs stdio holds DATABASE_URL (ADR-0039).
  const userId = await verifyApiKey(getPrisma(), env.JSC_API_KEY);
  if (!userId) {
    throw new Error('JSC_API_KEY is not a valid API key: create one on /profile in the web app');
  }
  const server = createServer({ userId });
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // stdout is reserved for MCP protocol messages — all logging must go to stderr.
  console.error('job-search-copilot MCP server running on stdio');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
