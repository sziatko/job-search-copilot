import {
  DomainError,
  EstimatedVacancyService,
  RECOMMENDATION_INPUT_VALUES,
} from '@job-search-copilot/core';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

// Accepts both the canonical English value and its Ukrainian equivalent (what
// vacancy-match-analyzer actually outputs) — normalized in EstimatedVacancyService.save().
const RecommendationInputEnum = z.enum(RECOMMENDATION_INPUT_VALUES);
// Filtering only makes sense against the canonical value already stored in the DB.
const RecommendationFilterEnum = z.enum(['APPLY', 'APPLY_WITH_CAVEATS', 'SKIP']);
const UserActionEnum = z.enum(['NOT_REVIEWED', 'READY_TO_APPLY', 'APPLIED', 'DECLINED']);

/** Builds the MCP server with all tools registered, without connecting a transport.
 * Kept separate from index.ts so tests can connect it to an in-memory transport
 * instead of real stdio.
 *
 * @param vacancies domain service to back the tools. Defaults to one on the shared
 *   lazy Prisma client; tests can pass their own.
 */
export function createServer(
  vacancies: EstimatedVacancyService = new EstimatedVacancyService(),
): McpServer {
  const server = new McpServer({ name: 'job-search-copilot', version: '0.1.0' });

  server.registerTool(
    'save_estimated_vacancy',
    {
      title: 'Save analyzed vacancy',
      description:
        'Save a vacancy analyzed by vacancy-match-analyzer, keyed by applyUrl. ' +
        'A vacancy is analyzed once: if one with this applyUrl already exists the ' +
        'incoming analysis is discarded. Returns { created, vacancy } — check ' +
        '`created` to know whether this analysis was stored (true) or dropped (false).',
      inputSchema: {
        company: z.string(),
        title: z.string(),
        applyUrl: z.url(),
        fullText: z.string(),
        matchScore: z.number().int().min(0).max(100),
        recommendation: RecommendationInputEnum,
        estimationComment: z.string(),
      },
    },
    async (input) => {
      try {
        const result = await vacancies.save(input);
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      } catch (err) {
        // A caller mistake (e.g. an unrecognized recommendation) — report it as a
        // tool error like the not-found cases below, not a thrown protocol error.
        if (err instanceof DomainError) {
          return { isError: true, content: [{ type: 'text', text: err.message }] };
        }
        throw err;
      }
    },
  );

  server.registerTool(
    'get_estimated_vacancy',
    {
      title: 'Get estimated vacancy by id',
      description:
        'Fetch one estimated vacancy including its full text, e.g. for resume tailoring.',
      inputSchema: { id: z.number().int() },
    },
    async ({ id }) => {
      const vacancy = await vacancies.getById(id);
      if (!vacancy) {
        return {
          isError: true,
          content: [{ type: 'text', text: `EstimatedVacancy ${id} not found` }],
        };
      }
      return { content: [{ type: 'text', text: JSON.stringify(vacancy, null, 2) }] };
    },
  );

  server.registerTool(
    'list_estimated_vacancies',
    {
      title: 'List / search estimated vacancies',
      description:
        'List estimated vacancies with optional filters (recommendation, userAction, company). ' +
        'Does not include fullText — use get_estimated_vacancy for that.',
      inputSchema: {
        recommendation: RecommendationFilterEnum.optional(),
        userAction: UserActionEnum.optional(),
        company: z.string().optional(),
        limit: z.number().int().min(1).max(100).optional(),
        offset: z.number().int().min(0).optional(),
      },
    },
    async (filters) => {
      const result = await vacancies.list(filters);
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.registerTool(
    'update_estimated_vacancy_user_action',
    {
      title: 'Update my action on an estimated vacancy',
      description:
        "Set what the user actually decided to do about a vacancy — separate from the analyzer's recommendation.",
      inputSchema: { id: z.number().int(), userAction: UserActionEnum },
    },
    async ({ id, userAction }) => {
      const vacancy = await vacancies.updateUserAction(id, userAction);
      if (!vacancy) {
        return {
          isError: true,
          content: [{ type: 'text', text: `EstimatedVacancy ${id} not found` }],
        };
      }
      return { content: [{ type: 'text', text: JSON.stringify(vacancy, null, 2) }] };
    },
  );

  return server;
}
