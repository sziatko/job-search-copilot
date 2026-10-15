import type { ApplicationService } from '@job-search-copilot/core';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { BATCH_MAX, pagination } from '../common/schemas';
import { json, ref, toolError, withDomainErrors } from '../common/tool-result';
import { VacancyStatusEnum } from '../vacancies/vacancies.schemas';
import {
  PipelineStatusEnum,
  RecordApplicationItemSchema,
  toRecordInput,
} from './applications.schemas';

const APPLICATION_LIST_MAX = 500;

/** Registers the 6 application-tracking tools on `server`, backed by `applications` —
 * update_vacancy_status among them: it moves any vacancy, and carries a comment. */
export function registerApplicationTools(
  server: McpServer,
  applications: ApplicationService,
  userId: string,
): void {
  server.registerTool(
    'record_application',
    {
      title: 'Record a job application',
      description:
        'Log that the user applied to a role. Identify the vacancy by `vacancyId`, or by ' +
        '`company` + `title` (and `applyUrl` when you have one), looked up in the vacancies ' +
        'table: first the vacancy with that `applyUrl` (raw is fine), else by name, ignoring ' +
        'case, punctuation and legal forms (`Acme` finds `Acme Sp. z o.o.`) — an unknown ' +
        'link (a company ATS link for a LinkedIn vacancy) still falls back to the name. A ' +
        'unique match moves that vacancy to APPLIED; no match creates a minimal vacancy ' +
        'row (no posting text; a score and verdict only when you pass `matchScore`, ' +
        'otherwise it has no analysis), also APPLIED; more than one match is an error ' +
        'listing the candidate ids — retry with ' +
        'the right one as `vacancyId`. A vacancy already in the pipeline (APPLIED … ' +
        'REJECTED) is an error too. `matchScore` / `estimationComment` only shape a ' +
        'vacancy this call creates, and so does an `applyUrl` that matched nothing (as ' +
        'its link). `status` records it further along — APPLIED is ' +
        "still journaled first, as the applied date. `comment` is the user's own note: it " +
        'is added to the vacancy as a USER comment. `estimationComment` becomes the ' +
        'ANALYZER comment of a vacancy this call creates, and is ignored when it links to ' +
        'an existing one. Returns { success: true, application: { id, company, title } } ' +
        "— `id` is the vacancy's. Use list_applications to see full state. Recording " +
        'several applications at once? Use record_applications_batch instead.',
      inputSchema: RecordApplicationItemSchema.shape,
    },
    withDomainErrors(async (input) => {
      const result = await applications.record(userId, toRecordInput(input));
      return json({ success: true, application: ref(result.application) });
    }),
  );

  server.registerTool(
    'record_applications_batch',
    {
      title: 'Record multiple job applications in one call',
      description:
        'Batch form of record_application — same vacancyId or company/title rule ' +
        'per item. All-or-nothing: run in one transaction, so a failing item (unknown ' +
        'match, ambiguous match, a vacancy already in the pipeline) rolls back the whole ' +
        'batch — safe to retry. Returns one entry per input, same order and same shape ' +
        `as record_application: { success: true, application: { id, company, title } }. ` +
        `Max ${BATCH_MAX} per call.`,
      inputSchema: { applications: z.array(RecordApplicationItemSchema).min(1).max(BATCH_MAX) },
    },
    withDomainErrors(async ({ applications: items }) => {
      const { results } = await applications.recordMany(userId, items.map(toRecordInput));
      const compact = results.map((r) => ({ success: true, application: ref(r.application) }));
      return json(compact);
    }),
  );

  server.registerTool(
    'list_applications',
    {
      title: 'List / search applications',
      description:
        'List the vacancies in the pipeline (APPLIED … REJECTED), the last status move ' +
        "first. `id` is the vacancy's id. Optional filters: `status`, one pipeline " +
        'status; `search`, a single free-text term matched against company OR title; ' +
        'and/or `company` / `title`, matched independently — giving more than one of ' +
        '`search`/`company`/`title` narrows to rows matching all of them (AND), not any ' +
        'one (OR). Each is ILIKE %term%, case-insensitive. `applyUrl` finds the one ' +
        'application with that posting link — raw is fine, it is normalized as saved (a ' +
        'LinkedIn link from an email matches). Each item carries status, ' +
        'statusChangedAt, appliedAt (null if the vacancy skipped APPLIED), salary / CV, ' +
        'company / title / applyUrl / matchScore / recommendation, and `comments` — ' +
        '[{ id, createdAt, body, source }], oldest first, source ANALYZER | USER | AGENT.',
      inputSchema: {
        status: PipelineStatusEnum.optional(),
        search: z.string().optional(),
        company: z.string().optional(),
        title: z.string().optional(),
        applyUrl: z.string().optional(),
        ...pagination(APPLICATION_LIST_MAX),
      },
    },
    async (filters) => {
      // `nextCursor` is the web's (ADR-0030); this tool pages by offset.
      const { items, total } = await applications.list(userId, filters);
      return json({ items, total });
    },
  );

  server.registerTool(
    'update_vacancy_status',
    {
      title: 'Update a vacancy status',
      description:
        "Move a vacancy to a new status — the user's triage (NOT_REVIEWED, SAVED_FOR_LATER, " +
        'DECLINED, UNAVAILABLE — the posting no longer takes applications, FILTERED_OUT — ' +
        'screened out before triage, NEW — back to the analysis queue, only for a vacancy ' +
        'without an analysis) or a pipeline stage (APPLIED … REJECTED; ACTION_NEEDED — the ' +
        'company wrote and the user must act: a question, a call to book, a test task; ' +
        'AWAITING — the user answered or did what was asked and waits on the company); ' +
        "separate from the analyzer's recommendation — writing an analysis moves NEW by itself " +
        '(submit_analysis). To record applying, prefer record_application. ' +
        'Identify the vacancy either by `id` (from list_vacancies / list_applications), ' +
        'or by `company` + `title` — the latter is for a caller that only knows the ' +
        'company/role (e.g. an agent reading a rejection/offer email) and matches by name ' +
        'as record_application does (case, punctuation and legal forms aside), among the ' +
        'vacancies already applied to only — a vacancy ' +
        'never applied to is "not found". Exactly one of the two must be given. A ' +
        '(company, title) match with more than one candidate is an error listing the ids to disambiguate ' +
        'with `id`; an unknown id or an unmatched (company, title) reports "not found" — ' +
        'this tool never creates anything. Every pipeline move is an event: it is journaled ' +
        'and moves the status date even when the status is the same (the next interview ' +
        'round is INTERVIEW again) — so call it once per real event, not for a reminder ' +
        'of one already recorded. A triage status the vacancy already has is an error: ' +
        'a repeat carries no event, and nothing is written. `comment` is optional: when given it is added to the vacancy ' +
        'as a new dated AGENT comment — earlier comments are never changed. Returns ' +
        '{ success: true, vacancy: { id, company, title } }.',
      inputSchema: {
        id: z.number().int().optional(),
        company: z.string().min(1).optional(),
        title: z.string().min(1).optional(),
        status: VacancyStatusEnum,
        comment: z.string().optional(),
      },
    },
    withDomainErrors(async ({ id, company, title, status, comment }) => {
      let application: Awaited<ReturnType<typeof applications.updateStatus>>;
      if (id != null) {
        application = await applications.updateStatus(userId, id, status, comment, 'AGENT');
      } else if (company && title) {
        application = await applications.updateStatusByVacancy(
          userId,
          company,
          title,
          status,
          comment,
          'AGENT',
        );
      } else {
        return toolError('Provide either `id`, or both `company` and `title`.');
      }

      return json({ success: true, vacancy: ref(application) });
    }),
  );

  server.registerTool(
    'update_application',
    {
      title: 'Edit what was entered when applying',
      description:
        'Correct the application form data of a vacancy: `salaryInApplication` (what the ' +
        "applicant entered in the form — not the posting's salary; a blank string clears " +
        'it) and/or `usedTailoredResume`. A field left out is untouched. Moves no status ' +
        'and adds no comment — use update_vacancy_status or add_comment. `id` is the ' +
        'vacancy\'s (from list_applications); an unknown id reports "not found". Returns ' +
        '{ success: true, application: { id, company, title } }.',
      inputSchema: {
        id: z.number().int(),
        salaryInApplication: z.string().optional(),
        usedTailoredResume: z.boolean().optional(),
      },
    },
    withDomainErrors(async ({ id, salaryInApplication, usedTailoredResume }) => {
      const application = await applications.update(userId, id, {
        salaryInApplication,
        usedTailoredResume,
      });
      return json({ success: true, application: ref(application) });
    }),
  );

  server.registerTool(
    'add_comment',
    {
      title: 'Add a comment to a vacancy',
      description:
        'Add a new dated comment to a vacancy without moving its status — a note, not an ' +
        "event. `source` is USER when the comment is the user's own words, AGENT (the " +
        'default) for your own note; never the analysis (that is the ANALYZER comment ' +
        'submit_analysis writes). Earlier comments are never changed. `id` is the ' +
        'vacancy\'s; an unknown id reports "not found", a blank `body` is an error. ' +
        'Returns { success: true, vacancy: { id, company, title } }.',
      inputSchema: {
        id: z.number().int(),
        body: z.string().min(1),
        source: z.enum(['USER', 'AGENT']).default('AGENT'),
      },
    },
    withDomainErrors(async ({ id, body, source }) => {
      const vacancy = await applications.addComment(userId, id, body, source);
      return json({ success: true, vacancy: ref(vacancy) });
    }),
  );
}
