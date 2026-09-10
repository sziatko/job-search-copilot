import './env';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createServer } from './server';

async function main() {
  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // stdout is reserved for MCP protocol messages — all logging must go to stderr.
  console.error('job-search-copilot MCP server running on stdio');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
