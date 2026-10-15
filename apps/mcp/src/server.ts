import { ApplicationService, VacancyIntakeService, VacancyService } from '@job-search-copilot/core';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerApplicationTools } from './applications/applications.tools';
import { registerIntakeTools } from './intake/intake.tools';
import { registerVacancyTools } from './vacancies/vacancies.tools';

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
  'Order: intake_vacancy before analysing a posting — only a new one is analysed — ' +
    'then save_vacancy, which attaches the analysis to the vacancy the intake created. ' +
    'A link alone: list_vacancies({ applyUrl }) first, and fetch the page for its company ' +
    'and title only when nothing is found.',
  'The analysis queue: vacancies taken in without an analysis wait in status NEW. Work ' +
    "it with list_vacancies({ status: ['NEW'], hasText: true }) → get_vacancies_batch → " +
    'score each → submit_analyses_batch, at most 10 per call. An analysis is written ' +
    'once: a vacancy that has one refuses another.',
  'Status, one per vacancy: NEW (waiting for an analysis); triage NOT_REVIEWED, ' +
    'SAVED_FOR_LATER, DECLINED (the applicant chose not to apply), UNAVAILABLE (the ' +
    'posting no longer takes applications), FILTERED_OUT (screened out before triage, ' +
    "by the analysis' SKIP or the applicant); then the pipeline, each status saying whose " +
    'move it is: APPLIED (waiting for their first answer), ACTION_NEEDED (they wrote and ' +
    'the applicant must act: a question, a call to book, a test task), INTERVIEW, AWAITING ' +
    '(the applicant answered or did what was asked — a reply, a test task, an interview — ' +
    'and waits on the company), OFFER, REJECTED (the company said no). `recommendation` is the ' +
    "analyzer's verdict — never derive one from the other; the one link is the server's: " +
    'writing an analysis moves a NEW vacancy to FILTERED_OUT on SKIP, else to ' +
    'NOT_REVIEWED, and moves no other status. Record applying with ' +
    'record_application; make every other move with update_vacancy_status. Each pipeline ' +
    'status write is an event, dated by the server — the same status again too (the next ' +
    'interview round) — so write once per real event. A triage status the vacancy ' +
    'already has is refused as an error: it carries no event.',
  'Comments are append-only notes with a source (ANALYZER, USER, AGENT). Write each ' +
    'one as a note of its own; never repeat an earlier one.',
].join('\n\n');

export interface ServerContext {
  /** Whose data the tools act on: the OAuth token's `sub` or the API key's owner (ADR-0039). */
  userId: string;
  /** Domain services; default to ones on the shared lazy Prisma client, tests can pass their own. */
  vacancies?: VacancyService;
  applications?: ApplicationService;
  intake?: VacancyIntakeService;
}

/** Builds the MCP server with all tools registered, without connecting a transport.
 * Kept separate from index.ts so tests can connect it to an in-memory transport
 * instead of real stdio (ADR-0010).
 */
export function createServer({
  userId,
  vacancies = new VacancyService(),
  applications = new ApplicationService(),
  intake = new VacancyIntakeService(),
}: ServerContext): McpServer {
  const server = new McpServer(
    { name: 'job-search-copilot', version: '0.1.0' },
    { instructions: SERVER_INSTRUCTIONS },
  );

  registerVacancyTools(server, vacancies, userId);
  registerApplicationTools(server, applications, userId);
  registerIntakeTools(server, intake, userId);

  return server;
}
