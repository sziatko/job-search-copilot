import type { VacancyService } from '@job-search-copilot/core';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { BATCH_MAX, pagination } from '../common/schemas';
import { json, ref, withDomainErrors } from '../common/tool-result';
import {
  RecommendationFilterEnum,
  SaveVacancyItemSchema,
  VacancyStatusEnum,
} from './vacancies.schemas';

const VACANCY_LIST_MAX = 100;

/** Registers the 4 vacancy tools on `server`, backed by `vacancies`. A vacancy's status
 * is set through update_vacancy_status, with the application tools. */
export function registerVacancyTools(server: McpServer, vacancies: VacancyService): void {
  server.registerTool(
    'save_vacancy',
    {
      title: 'Save analyzed vacancy',
      description:
        'Save an analyzed vacancy, keyed by applyUrl. It does not write the vacancy log — ' +
        'check_vacancy_log comes first, before the analysis. ' +
        'A vacancy is analyzed once: if one with this applyUrl already exists the ' +
        'incoming analysis is discarded. Returns { success, vacancy: { id, company, ' +
        'title } } — `success` is false when the analysis was dropped as a duplicate. ' +
        'Use get_vacancy(id) to read back the full stored record. Saving ' +
        'several vacancies from one analysis run? Use save_vacancies_batch instead.',
      inputSchema: SaveVacancyItemSchema.shape,
    },
    withDomainErrors(async (input) => {
      const result = await vacancies.save(input);
      return json({
        success: result.created,
        vacancy: ref(result.vacancy),
      });
    }),
  );

  server.registerTool(
    'save_vacancies_batch',
    {
      title: 'Save multiple analyzed vacancies in one call',
      description:
        'Batch form of save_vacancy — same applyUrl-dedup rule per item ' +
        '(analyze-once: an existing applyUrl is skipped, not overwritten). Returns one ' +
        'entry per input, same order and same shape as save_vacancy: ' +
        '{ success, vacancy: { id, company, title } }. Use this instead of N separate ' +
        `save_vacancy calls when saving a batch from one analysis run. Max ` +
        `${BATCH_MAX} per call.`,
      inputSchema: { vacancies: z.array(SaveVacancyItemSchema).min(1).max(BATCH_MAX) },
    },
    withDomainErrors(async ({ vacancies: items }) => {
      const { results } = await vacancies.saveMany(items);
      const compact = results.map((r) => ({ success: r.created, vacancy: ref(r.vacancy) }));
      return json(compact);
    }),
  );

  server.registerTool(
    'get_vacancy',
    {
      title: 'Get vacancy by id',
      description:
        'Fetch one vacancy including its full text (e.g. for resume tailoring), its ' +
        'status, and every comment — [{ id, createdAt, body, source }], oldest first.',
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
    'list_vacancies',
    {
      title: 'List / search vacancies',
      description:
        'List vacancies, newest first, with optional filters: recommendation; status, ' +
        'any of a list (NOT_REVIEWED, SAVED_FOR_LATER, DECLINED, then the pipeline: ' +
        'APPLIED … REJECTED); company, title — ILIKE %term%, case-insensitive; applyUrl — ' +
        'the vacancy with that posting link, raw is fine (normalized as saved). Does not ' +
        'include fullText — use get_vacancy for that.',
      inputSchema: {
        recommendation: RecommendationFilterEnum.optional(),
        status: z.array(VacancyStatusEnum).optional(),
        company: z.string().optional(),
        title: z.string().optional(),
        applyUrl: z.string().optional(),
        ...pagination(VACANCY_LIST_MAX),
      },
    },
    async (filters) => {
      const result = await vacancies.list(filters);
      return json(result);
    },
  );
}
