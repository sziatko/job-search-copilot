import {
  ApplicationService,
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
const ApplicationStatusEnum = z.enum([
  'APPLIED',
  'RECRUITER_SCREEN',
  'REPLIED',
  'INTERVIEW',
  'OFFER',
  'REJECTED',
  'NO_RESPONSE',
]);

/** Builds the MCP server with all tools registered, without connecting a transport.
 * Kept separate from index.ts so tests can connect it to an in-memory transport
 * instead of real stdio.
 *
 * @param vacancies domain service to back the tools. Defaults to one on the shared
 *   lazy Prisma client; tests can pass their own.
 * @param applications same, for the application-tracking tools.
 */
export function createServer(
  vacancies: EstimatedVacancyService = new EstimatedVacancyService(),
  applications: ApplicationService = new ApplicationService(),
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

  server.registerTool(
    'record_application',
    {
      title: 'Record a job application',
      description:
        'Log that the user applied to a role. `company` and `title` are required and are ' +
        'looked up (case-insensitive) in the analyzed-vacancies table: a unique match ' +
        'links the application to it and marks that vacancy APPLIED; no match creates a ' +
        'minimal vacancy row (fullText "N/A", score/verdict from what you pass or a ' +
        'placeholder) also marked APPLIED; more than one match is an error listing the ' +
        "candidate ids. The result's `resolution` says which happened.",
      inputSchema: {
        company: z.string().min(1),
        title: z.string().min(1),
        applyUrl: z.url().optional(),
        matchScore: z.number().int().min(0).max(100).optional(),
        estimationComment: z.string().optional(),
        salaryInListing: z.string().optional(),
        usedTailoredResume: z.boolean().optional(),
        userComment: z.string().optional(),
        status: ApplicationStatusEnum.optional(),
      },
    },
    async (input) => {
      try {
        const result = await applications.record(input);
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      } catch (err) {
        if (err instanceof DomainError) {
          return { isError: true, content: [{ type: 'text', text: err.message }] };
        }
        throw err;
      }
    },
  );

  server.registerTool(
    'list_applications',
    {
      title: 'List / search applications',
      description:
        'List recorded applications with optional filters (status, or a search term ' +
        'matched against company or role). Each item is flattened: the application ' +
        'fields plus company / title / applyUrl / matchScore / recommendation / ' +
        'estimationComment from the linked vacancy.',
      inputSchema: {
        status: ApplicationStatusEnum.optional(),
        search: z.string().optional(),
        limit: z.number().int().min(1).max(500).optional(),
        offset: z.number().int().min(0).optional(),
      },
    },
    async (filters) => {
      const result = await applications.list(filters);
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.registerTool(
    'update_application_status',
    {
      title: 'Update an application status',
      description:
        'Move a recorded application to a new pipeline stage. Identify it either by `id` ' +
        '(from list_applications), or by `company` + `title` — the latter is for a caller ' +
        'that only knows the company/role (e.g. an agent reading a rejection/offer email) ' +
        'and matches case-insensitively against the analyzed vacancy the application is ' +
        'linked to. Exactly one of the two must be given. A (company, title) match with ' +
        'more than one candidate is an error listing the ids to disambiguate with `id`; an ' +
        'unknown id, an unmatched (company, title), or a vacancy that was analyzed but ' +
        'never actually recorded as applied (call record_application first — this tool ' +
        'never creates anything) all report "not found". `statusComment` is optional and ' +
        "APPENDED to whatever is already stored there (joined with ' / '), not overwritten " +
        '— e.g. "Recruiter called." then later "Interview on 20.09." become "Recruiter ' +
        'called. / Interview on 20.09."',
      inputSchema: {
        id: z.number().int().optional(),
        company: z.string().min(1).optional(),
        title: z.string().min(1).optional(),
        status: ApplicationStatusEnum,
        statusComment: z.string().optional(),
      },
    },
    async ({ id, company, title, status, statusComment }) => {
      if (id == null && (!company || !title)) {
        return {
          isError: true,
          content: [{ type: 'text', text: 'Provide either `id`, or both `company` and `title`.' }],
        };
      }
      try {
        const application =
          id != null
            ? await applications.updateStatus(id, status, statusComment)
            : await applications.updateStatusByVacancy(
                // biome-ignore lint/style/noNonNullAssertion: guarded above
                company!,
                // biome-ignore lint/style/noNonNullAssertion: guarded above
                title!,
                status,
                statusComment,
              );
        if (!application) {
          const target = id != null ? `Application ${id}` : `"${company}" / "${title}"`;
          return {
            isError: true,
            content: [{ type: 'text', text: `${target} not found` }],
          };
        }
        return { content: [{ type: 'text', text: JSON.stringify(application, null, 2) }] };
      } catch (err) {
        if (err instanceof DomainError) {
          return { isError: true, content: [{ type: 'text', text: err.message }] };
        }
        throw err;
      }
    },
  );

  return server;
}
