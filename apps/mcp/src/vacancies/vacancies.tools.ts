import { ANALYSIS_BATCH_MAX, type VacancyService } from '@job-search-copilot/core';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { BATCH_MAX, pagination } from '../common/schemas';
import { json, ref, toolError, withDomainErrors } from '../common/tool-result';
import {
  RecommendationFilterEnum,
  SaveVacancyItemSchema,
  SubmitAnalysisItemSchema,
  VacancyStatusEnum,
} from './vacancies.schemas';

const VACANCY_LIST_MAX = 100;

/** The rule the server applies when it writes an analysis — said in every tool that
 * writes one (Claude Desktop drops SERVER_INSTRUCTIONS). */
const ANALYSIS_RULE =
  'The analysis moves the status itself, never the caller: from NEW, SKIP → FILTERED_OUT, ' +
  'anything else → NOT_REVIEWED (both journaled); from any other status it moves nothing.';

/** Registers the 7 vacancy tools on `server`, backed by `vacancies`. A vacancy's status
 * is set through update_vacancy_status, with the application tools. */
export function registerVacancyTools(server: McpServer, vacancies: VacancyService): void {
  server.registerTool(
    'save_vacancy',
    {
      title: 'Save analyzed vacancy',
      description:
        'Save an analyzed vacancy, keyed by applyUrl. intake_vacancy comes first, before ' +
        'the analysis: it creates a new posting as a vacancy in status NEW, with no ' +
        'analysis, and save_vacancy then attaches the analysis to it. The analysis is ' +
        'written once: an existing applyUrl without one gets this analysis (and the ' +
        'posting text, if it had none); one that has an analysis keeps it, and the ' +
        `incoming one is discarded. ${ANALYSIS_RULE} Returns { success, vacancy: { id, ` +
        'company, title } } — `success` is false when the analysis was dropped as a ' +
        'duplicate. Use get_vacancy(id) to read back the full stored record. Saving ' +
        'several vacancies from one analysis run? Use save_vacancies_batch instead.',
      inputSchema: SaveVacancyItemSchema.shape,
    },
    withDomainErrors(async (input) => {
      const result = await vacancies.save(input);
      return json({
        success: result.created || result.attached,
        vacancy: ref(result.vacancy),
      });
    }),
  );

  server.registerTool(
    'save_vacancies_batch',
    {
      title: 'Save multiple analyzed vacancies in one call',
      description:
        'Batch form of save_vacancy — same applyUrl rule per item (an existing applyUrl ' +
        'without an analysis gets this one; one with an analysis is skipped, not ' +
        'overwritten). Returns one entry per input, same order and same shape as ' +
        'save_vacancy: { success, vacancy: { id, company, title } }. Use this instead of N ' +
        `separate save_vacancy calls when saving a batch from one analysis run. Max ` +
        `${BATCH_MAX} per call.`,
      inputSchema: { vacancies: z.array(SaveVacancyItemSchema).min(1).max(BATCH_MAX) },
    },
    withDomainErrors(async ({ vacancies: items }) => {
      const { results } = await vacancies.saveMany(items);
      const compact = results.map((r) => ({
        success: r.created || r.attached,
        vacancy: ref(r.vacancy),
      }));
      return json(compact);
    }),
  );

  server.registerTool(
    'submit_analysis',
    {
      title: 'Submit the analysis of a vacancy already stored',
      description:
        'Write the analysis of a vacancy that is stored without one, by its id — one ' +
        'waiting in the analysis queue (status NEW) or an application recorded without a ' +
        'score. The analysis is written once: a vacancy that already has one is an error, ' +
        `and nothing is written. ${ANALYSIS_RULE} Returns { success: true, vacancy: { id, ` +
        'company, title } }. Several? Use submit_analyses_batch.',
      inputSchema: SubmitAnalysisItemSchema.shape,
    },
    withDomainErrors(async (input) =>
      json({ success: true, vacancy: ref(await vacancies.submitAnalysis(input)) }),
    ),
  );

  server.registerTool(
    'submit_analyses_batch',
    {
      title: 'Submit several analyses in one call',
      description:
        'Batch form of submit_analysis, same rule per item, in one transaction: all or ' +
        'nothing — one item that fails (already analysed, unknown id) writes none of ' +
        'them; drop it and send the rest again. Returns one entry per input, same order: ' +
        `{ success: true, vacancy: { id, company, title } }. Max ${ANALYSIS_BATCH_MAX} per ` +
        'call.',
      inputSchema: {
        analyses: z.array(SubmitAnalysisItemSchema).min(1).max(ANALYSIS_BATCH_MAX),
      },
    },
    withDomainErrors(async ({ analyses }) => {
      const rows = await vacancies.submitAnalyses(analyses);
      return json(rows.map((row) => ({ success: true, vacancy: ref(row) })));
    }),
  );

  server.registerTool(
    'get_vacancy',
    {
      title: 'Get vacancy by id',
      description:
        'Fetch one vacancy including its full text (e.g. for resume tailoring), its ' +
        'status, every comment — [{ id, createdAt, body, source }], oldest first — and its ' +
        'status timeline — [{ status, createdAt }], oldest first.',
      inputSchema: { id: z.number().int() },
    },
    async ({ id }) => {
      const vacancy = await vacancies.getById(id);
      if (!vacancy) {
        return {
          isError: true,
          content: [{ type: 'text', text: `Vacancy ${id} not found` }],
        };
      }
      return json(vacancy);
    },
  );

  server.registerTool(
    'get_vacancies_batch',
    {
      title: 'Get several vacancies by id',
      description:
        'Batch form of get_vacancy: each vacancy as get_vacancy returns it, fullText ' +
        'included, in the order of `ids`. The analysis queue: list_vacancies({ status: ' +
        "['NEW'], hasText: true }) → get_vacancies_batch → score each → " +
        'submit_analyses_batch. An unknown id is an error naming it. Max ' +
        `${ANALYSIS_BATCH_MAX} per call.`,
      inputSchema: { ids: z.array(z.number().int()).min(1).max(ANALYSIS_BATCH_MAX) },
    },
    async ({ ids }) => {
      const rows = await Promise.all(ids.map((id) => vacancies.getById(id)));
      const missing = ids.filter((_, i) => rows[i] === null);
      return missing.length > 0 ? toolError(`Vacancy ${missing.join(', ')} not found`) : json(rows);
    },
  );

  server.registerTool(
    'list_vacancies',
    {
      title: 'List / search vacancies',
      description:
        'List vacancies, newest first, with optional filters: recommendation; status, ' +
        'any of a list (NEW — waiting for an analysis; triage NOT_REVIEWED, ' +
        'SAVED_FOR_LATER, DECLINED, UNAVAILABLE, FILTERED_OUT — screened out before ' +
        'triage; then the pipeline: APPLIED … REJECTED); hasText — true: only vacancies ' +
        'with posting text, false: only those without; company, title — ILIKE %term%, ' +
        'case-insensitive; applyUrl — the vacancy with that posting link, raw is fine ' +
        '(normalized as saved). Each item carries hasAnalysis and hasText; matchScore and ' +
        'recommendation are null until analysed. Does not include fullText — use ' +
        'get_vacancy / get_vacancies_batch for that.',
      inputSchema: {
        recommendation: RecommendationFilterEnum.optional(),
        status: z.array(VacancyStatusEnum).optional(),
        hasText: z.boolean().optional(),
        company: z.string().optional(),
        title: z.string().optional(),
        applyUrl: z.string().optional(),
        ...pagination(VACANCY_LIST_MAX),
      },
    },
    async (filters) => {
      // `nextCursor` is the web's (ADR-0030); this tool pages by offset.
      const { items, total } = await vacancies.list(filters);
      return json({ items, total });
    },
  );
}
