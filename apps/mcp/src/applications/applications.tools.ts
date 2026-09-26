import type { ApplicationService } from '@job-search-copilot/core';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { BATCH_MAX, pagination } from '../common/schemas';
import { json, ref, toolError, withDomainErrors } from '../common/tool-result';
import { ApplicationStatusEnum, RecordApplicationItemSchema } from './applications.schemas';

const APPLICATION_LIST_MAX = 500;

/** Registers the 4 application-tracking tools on `server`, backed by `applications`. */
export function registerApplicationTools(
  server: McpServer,
  applications: ApplicationService,
): void {
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
    withDomainErrors(async (input) => {
      const result = await applications.record(input);
      return json({ success: true, application: ref(result.application) });
    }),
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
        `title } }. Max ${BATCH_MAX} per call.`,
      inputSchema: { applications: z.array(RecordApplicationItemSchema).min(1).max(BATCH_MAX) },
    },
    withDomainErrors(async ({ applications: items }) => {
      const { results } = await applications.recordMany(items);
      const compact = results.map((r) => ({ success: true, application: ref(r.application) }));
      return json(compact);
    }),
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
        'is flattened: the application fields (with its `comments` timeline, oldest first) ' +
        'plus company / title / applyUrl / ' +
        'matchScore / recommendation / estimationComment from the linked vacancy.',
      inputSchema: {
        status: ApplicationStatusEnum.optional(),
        search: z.string().optional(),
        company: z.string().optional(),
        title: z.string().optional(),
        ...pagination(APPLICATION_LIST_MAX),
      },
    },
    async (filters) => {
      const result = await applications.list(filters);
      return json(result);
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
        'never creates anything) all report "not found". `statusComment` is optional: when ' +
        "given it is added to the application's timeline as a new dated comment — earlier " +
        'comments are never changed. Returns { success: true, application: { id, company, ' +
        'title } } — use list_applications to see the resulting status and `comments` ' +
        '([{ id, createdAt, body }], oldest first).',
      inputSchema: {
        id: z.number().int().optional(),
        company: z.string().min(1).optional(),
        title: z.string().min(1).optional(),
        status: ApplicationStatusEnum,
        statusComment: z.string().optional(),
      },
    },
    withDomainErrors(async ({ id, company, title, status, statusComment }) => {
      let application: Awaited<ReturnType<typeof applications.updateStatus>>;
      if (id != null) {
        application = await applications.updateStatus(id, status, statusComment);
      } else if (company && title) {
        application = await applications.updateStatusByVacancy(
          company,
          title,
          status,
          statusComment,
        );
      } else {
        return toolError('Provide either `id`, or both `company` and `title`.');
      }

      if (!application) {
        const target = id != null ? `Application ${id}` : `"${company}" / "${title}"`;
        return toolError(`${target} not found`);
      }
      return json({ success: true, application: ref(application) });
    }),
  );
}
