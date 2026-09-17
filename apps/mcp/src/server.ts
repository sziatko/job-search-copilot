import { ApplicationService, EstimatedVacancyService } from '@job-search-copilot/core';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerApplicationTools } from './applications/applications.tools';
import { registerEstimatedVacancyTools } from './estimated-vacancies/estimated-vacancies.tools';

/** Builds the MCP server with all tools registered, without connecting a transport.
 * Kept separate from index.ts so tests can connect it to an in-memory transport
 * instead of real stdio.
 *
 * @param vacancies domain service to back the estimated-vacancy tools. Defaults to
 *   one on the shared lazy Prisma client; tests can pass their own.
 * @param applications same, for the application-tracking tools.
 */
export function createServer(
  vacancies: EstimatedVacancyService = new EstimatedVacancyService(),
  applications: ApplicationService = new ApplicationService(),
): McpServer {
  const server = new McpServer({ name: 'job-search-copilot', version: '0.1.0' });

  registerEstimatedVacancyTools(server, vacancies);
  registerApplicationTools(server, applications);

  return server;
}
