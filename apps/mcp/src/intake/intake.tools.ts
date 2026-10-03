import type { VacancyIntakeService } from '@job-search-copilot/core';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { BATCH_MAX } from '../common/schemas';
import { json, withDomainErrors } from '../common/tool-result';

// All three required and checked here: core skips an entry without them, which a caller
// would read as a duplicate (ADR-0033). The url goes on raw — core normalizes it.
const IntakeEntrySchema = z.object({
  url: z.httpUrl(),
  company: z.string().trim().min(1),
  title: z.string().trim().min(1),
  source: z
    .string()
    .optional()
    .describe('Where the posting was found: linkedin, justjoin, indeed, email, …'),
});

/** Registers the 2 intake tools on `server`, backed by `intake`. */
export function registerIntakeTools(server: McpServer, intake: VacancyIntakeService): void {
  server.registerTool(
    'intake_vacancy',
    {
      title: 'Take in one posting before analysing it',
      description:
        'Call before analysing a posting. `url`, `company` and `title` are all required ' +
        '— a link alone: find it with list_vacancies({ applyUrl }) first, and fetch the ' +
        'page for its company and title only when nothing is found. The url raw is fine ' +
        '(tracking params and LinkedIn host/slug variants are normalized), and the same ' +
        'role under a new link is caught by company + title. Returns { new: true } for a ' +
        'posting never seen before — this call creates it as a vacancy in status NEW, not ' +
        'analysed, and save_vacancy then attaches the analysis — or { new: false } for a ' +
        'duplicate. Only new postings go on to analysis. Take a posting in once: a second ' +
        'call finds the first and reports a duplicate. Several postings? Use ' +
        'intake_vacancies_batch.',
      inputSchema: IntakeEntrySchema.shape,
    },
    withDomainErrors(async (entry) => json(await intake.intake(entry))),
  );

  server.registerTool(
    'intake_vacancies_batch',
    {
      title: 'Take in several postings',
      description:
        'Batch form of intake_vacancy, same rule per entry, in order — a posting twice in ' +
        'one call is new only the first time. Every entry needs an http(s) url, a company ' +
        'and a title; one without them fails the whole call. Returns { new: [url, ...] }: ' +
        'the url of every new posting exactly as you sent it (each now a NEW vacancy); ' +
        `every other entry is a duplicate. Max ${BATCH_MAX} per call.`,
      inputSchema: { entries: z.array(IntakeEntrySchema).min(1).max(BATCH_MAX) },
    },
    withDomainErrors(async ({ entries }) => json(await intake.intakeMany(entries))),
  );
}
