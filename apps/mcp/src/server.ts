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

  const SaveVacancyItemSchema = z.object({
    company: z.string(),
    title: z.string(),
    applyUrl: z.url(),
    fullText: z.string(),
    matchScore: z.number().int().min(0).max(100),
    recommendation: RecommendationInputEnum,
    estimationComment: z.string(),
  });

  server.registerTool(
    'save_estimated_vacancy',
    {
      title: 'Save analyzed vacancy',
      description:
        'Save a vacancy analyzed by vacancy-match-analyzer, keyed by applyUrl. ' +
        'A vacancy is analyzed once: if one with this applyUrl already exists the ' +
        'incoming analysis is discarded. Returns { success, vacancy: { id, company, ' +
        'title } } — `success` is false when the analysis was dropped as a duplicate. ' +
        'Use get_estimated_vacancy(id) to read back the full stored record. Saving ' +
        'several vacancies from one analysis run? Use save_estimated_vacancies_batch instead.',
      inputSchema: SaveVacancyItemSchema.shape,
    },
    async (input) => {
      try {
        const result = await vacancies.save(input);
        const body = {
          success: result.created,
          vacancy: {
            id: result.vacancy.id,
            company: result.vacancy.company,
            title: result.vacancy.title,
          },
        };
        return { content: [{ type: 'text', text: JSON.stringify(body, null, 2) }] };
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
    'save_estimated_vacancies_batch',
    {
      title: 'Save multiple analyzed vacancies in one call',
      description:
        'Batch form of save_estimated_vacancy — same applyUrl-dedup rule per item ' +
        '(analyze-once: an existing applyUrl is skipped, not overwritten). Returns one ' +
        'entry per input, same order and same shape as save_estimated_vacancy: ' +
        '{ success, vacancy: { id, company, title } }. Use this instead of N separate ' +
        'save_estimated_vacancy calls when saving a batch from one analysis run. Max ' +
        '100 per call.',
      inputSchema: { vacancies: z.array(SaveVacancyItemSchema).min(1).max(100) },
    },
    async ({ vacancies: items }) => {
      try {
        const { results } = await vacancies.saveMany(items);
        const compact = results.map((r) => ({
          success: r.created,
          vacancy: { id: r.vacancy.id, company: r.vacancy.company, title: r.vacancy.title },
        }));
        return { content: [{ type: 'text', text: JSON.stringify(compact, null, 2) }] };
      } catch (err) {
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
        'List estimated vacancies with optional filters (recommendation, userAction, ' +
        'company, title — company/title match ILIKE %term%, case-insensitive). Does not ' +
        'include fullText — use get_estimated_vacancy for that.',
      inputSchema: {
        recommendation: RecommendationFilterEnum.optional(),
        userAction: UserActionEnum.optional(),
        company: z.string().optional(),
        title: z.string().optional(),
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
        'Set what the user actually decided to do about a vacancy — separate from the ' +
        "analyzer's recommendation. Returns { success: true, vacancy: { id } }.",
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
      const body = { success: true, vacancy: { id: vacancy.id } };
      return { content: [{ type: 'text', text: JSON.stringify(body, null, 2) }] };
    },
  );

  const RecordApplicationItemSchema = z.object({
    company: z.string().min(1),
    title: z.string().min(1),
    applyUrl: z.url().optional(),
    matchScore: z.number().int().min(0).max(100).optional(),
    estimationComment: z.string().optional(),
    salaryInListing: z.string().optional(),
    usedTailoredResume: z.boolean().optional(),
    userComment: z.string().optional(),
    status: ApplicationStatusEnum.optional(),
  });

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
        'candidate ids. Returns { success: true, application: { id, company, title } } — ' +
        'use list_estimated_vacancies / list_applications to see full state. Recording ' +
        'several applications at once? Use record_applications_batch instead.',
      inputSchema: RecordApplicationItemSchema.shape,
    },
    async (input) => {
      try {
        const result = await applications.record(input);
        const body = {
          success: true,
          application: {
            id: result.application.id,
            company: result.application.company,
            title: result.application.title,
          },
        };
        return { content: [{ type: 'text', text: JSON.stringify(body, null, 2) }] };
      } catch (err) {
        if (err instanceof DomainError) {
          return { isError: true, content: [{ type: 'text', text: err.message }] };
        }
        throw err;
      }
    },
  );

  server.registerTool(
    'record_applications_batch',
    {
      title: 'Record multiple job applications in one call',
      description:
        'Batch form of record_application — same company/title lookup-or-create rule ' +
        'per item. All-or-nothing: run in one transaction, so a failing item (unknown ' +
        'match, ambiguous match, an application that already exists) rolls back the ' +
        'whole batch — safe to retry. Returns one entry per input, same order and same ' +
        'shape as record_application: { success: true, application: { id, company, ' +
        'title } }. Max 100 per call.',
      inputSchema: { applications: z.array(RecordApplicationItemSchema).min(1).max(100) },
    },
    async ({ applications: items }) => {
      try {
        const { results } = await applications.recordMany(items);
        const compact = results.map((r) => ({
          success: true,
          application: {
            id: r.application.id,
            company: r.application.company,
            title: r.application.title,
          },
        }));
        return { content: [{ type: 'text', text: JSON.stringify(compact, null, 2) }] };
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
        'List recorded applications with optional filters: `status`; `search`, a single ' +
        "free-text term matched against the linked vacancy's company OR title; and/or " +
        '`company` / `title`, matched against the linked vacancy independently — giving ' +
        'more than one of `search`/`company`/`title` narrows to rows matching all of them ' +
        '(AND), not any one (OR). Each is ILIKE %term%, case-insensitive. Each result item ' +
        'is flattened: the application fields plus company / title / applyUrl / ' +
        'matchScore / recommendation / estimationComment from the linked vacancy.',
      inputSchema: {
        status: ApplicationStatusEnum.optional(),
        search: z.string().optional(),
        company: z.string().optional(),
        title: z.string().optional(),
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
        'called. / Interview on 20.09." Returns { success: true, application: { id, ' +
        'company, title } } — use list_applications to see the resulting status/statusComment.',
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
        const body = {
          success: true,
          application: {
            id: application.id,
            company: application.company,
            title: application.title,
          },
        };
        return { content: [{ type: 'text', text: JSON.stringify(body, null, 2) }] };
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
