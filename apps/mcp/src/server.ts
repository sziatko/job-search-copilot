import { ApplicationService, VacancyLogService, VacancyService } from '@job-search-copilot/core';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerApplicationTools } from './applications/applications.tools';
import { registerVacancyTools } from './vacancies/vacancies.tools';
import { registerVacancyLogTools } from './vacancy-log/vacancy-log.tools';

/**
 * Sent to every client on connect: the rules that span tools. A rule about one tool
 * belongs in its description; a rule about one user's workflow belongs in their skill.
 * Claude Desktop does not show these to the model (checked 2026-09-27) — so every rule
 * here must also be said in a tool description; this is a summary, not the only copy.
 */
export const SERVER_INSTRUCTIONS = [
  'job-search-copilot tracks one job search in one table of vacancies. An application ' +
    'is not a separate record: it is a vacancy whose status is in the pipeline, and ' +
    "every id, from any tool, is the vacancy's id.",
  'Order: check_vacancy_log before analysing a posting — only a new one is analysed — ' +
    'then save_vacancy. save_vacancy does not write the log.',
  'Status, one per vacancy: triage NOT_REVIEWED, SAVED_FOR_LATER, DECLINED (the ' +
    'applicant chose not to apply), UNAVAILABLE (the posting no longer takes ' +
    'applications); then the pipeline APPLIED, RECRUITER_SCREEN, ' +
    'REPLIED, INTERVIEW, OFFER, REJECTED (the company said no). `recommendation` is the ' +
    "analyzer's verdict — never derive one from the other. Record applying with " +
    'record_application; make every other move with update_vacancy_status. Each pipeline ' +
    'status write is an event, dated by the server — the same status again too (the next ' +
    'interview round) — so write once per real event. A triage status the vacancy ' +
    'already has is refused as an error: it carries no event.',
  'Comments are append-only notes with a source (ANALYZER, USER, AGENT). Write each ' +
    'one as a note of its own; never repeat an earlier one.',
].join('\n\n');

/** Builds the MCP server with all tools registered, without connecting a transport.
 * Kept separate from index.ts so tests can connect it to an in-memory transport
 * instead of real stdio.
 *
 * @param vacancies domain service to back the vacancy tools. Defaults to
 *   one on the shared lazy Prisma client; tests can pass their own.
 * @param applications same, for the application-tracking tools.
 * @param log same, for the vacancy-log tools.
 */
export function createServer(
  vacancies: VacancyService = new VacancyService(),
  applications: ApplicationService = new ApplicationService(),
  log: VacancyLogService = new VacancyLogService(),
): McpServer {
  const server = new McpServer(
    { name: 'job-search-copilot', version: '0.1.0' },
    { instructions: SERVER_INSTRUCTIONS },
  );

  registerVacancyTools(server, vacancies);
  registerApplicationTools(server, applications);
  registerVacancyLogTools(server, log);

  return server;
}
