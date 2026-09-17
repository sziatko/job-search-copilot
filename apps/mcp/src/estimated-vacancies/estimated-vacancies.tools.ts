import type { EstimatedVacancyService } from '@job-search-copilot/core';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { BATCH_MAX, pagination } from '../common/schemas';
import { json, ref, withDomainErrors } from '../common/tool-result';
import {
  RecommendationFilterEnum,
  SaveVacancyItemSchema,
  UserActionEnum,
} from './estimated-vacancies.schemas';

const VACANCY_LIST_MAX = 100;

/** Registers the 5 estimated-vacancy tools on `server`, backed by `vacancies`. */
export function registerEstimatedVacancyTools(
  server: McpServer,
  vacancies: EstimatedVacancyService,
): void {
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
    withDomainErrors(async (input) => {
      const result = await vacancies.save(input);
      return json({
        success: result.created,
        vacancy: ref(result.vacancy),
      });
    }),
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
        `save_estimated_vacancy calls when saving a batch from one analysis run. Max ` +
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
      return json(vacancy);
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
        ...pagination(VACANCY_LIST_MAX),
      },
    },
    async (filters) => {
      const result = await vacancies.list(filters);
      return json(result);
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
      return json({ success: true, vacancy: { id: vacancy.id } });
    },
  );
}
