import type { VacancyLogService } from '@job-search-copilot/core';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { BATCH_MAX } from '../common/schemas';
import { json, withDomainErrors } from '../common/tool-result';

// Plain strings, not `z.url()`: core normalizes and decides what is a usable link, so
// the rule lives in one place (ADR-0026).
const entryFields = {
  company: z.string().optional(),
  title: z.string().optional(),
};

/** Registers the 2 vacancy-log tools on `server`, backed by `log`. */
export function registerVacancyLogTools(server: McpServer, log: VacancyLogService): void {
  server.registerTool(
    'check_vacancy_log',
    {
      title: 'Check one posting against the vacancy log',
      description:
        'Call before analysing a posting. `url` is required, raw is fine (tracking ' +
        'params and LinkedIn host/slug variants are normalized); pass `company` and ' +
        '`title` when known — the same role under a new link is caught by them. ' +
        'Returns { new: true } for a posting never seen before (this call records it), ' +
        '{ new: false } for a duplicate. Only new postings go on to analysis. Check a ' +
        'posting once: a second call finds the first one and reports a duplicate. ' +
        'Several postings? Use check_vacancy_log_batch.',
      inputSchema: { url: z.string(), ...entryFields },
    },
    withDomainErrors(async (entry) => json(await log.check(entry))),
  );

  server.registerTool(
    'check_vacancy_log_batch',
    {
      title: 'Check several postings against the vacancy log',
      description:
        'Batch form of check_vacancy_log, same rule per entry, in order — a posting ' +
        'twice in one call is new only the first time. Returns { new: [url, ...] }: the ' +
        'url of every new posting exactly as you sent it (all are now recorded); every ' +
        'other entry is a duplicate. An entry without a usable http(s) url is ignored. ' +
        `Max ${BATCH_MAX} per call.`,
      inputSchema: {
        entries: z
          .array(z.object({ url: z.string().optional(), ...entryFields }))
          .min(1)
          .max(BATCH_MAX),
      },
    },
    withDomainErrors(async ({ entries }) => json(await log.checkMany(entries))),
  );
}
