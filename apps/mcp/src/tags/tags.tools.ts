import {
  ANALYSIS_BATCH_MAX,
  MAX_LENGTH,
  TAGS_PER_VACANCY_MAX,
  type TagService,
} from '@job-search-copilot/core';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { json, withDomainErrors } from '../common/tool-result';
import { TagNamesSchema } from '../vacancies/vacancies.schemas';

/** Registers the tag tools on `server`, backed by `tags`. No rename, tone or delete: an LLM
 * does not rebuild the user's tags (ADR-0042). */
export function registerTagTools(server: McpServer, tags: TagService, userId: string): void {
  server.registerTool(
    'list_tags',
    {
      title: 'List the tags',
      description:
        "The user's tags, by name: [{ id, name, tone, vacancyCount }]. Call it before writing " +
        'tags and reuse an existing name; a new name creates a tag. Renaming, the tone and ' +
        "deleting are the user's, not a tool's.",
    },
    withDomainErrors(async () => json(await tags.list(userId))),
  );

  server.registerTool(
    'tag_vacancies',
    {
      title: 'Add and remove tags on vacancies',
      description:
        'Add and remove tags by name, on vacancies that already exist; with an analysis, pass ' +
        '`tags` to the tool that writes it instead. list_tags first, reuse an existing name; a ' +
        'new name in `add` creates a tag. An unknown name in `remove` is ignored, and `remove` ' +
        'runs first, so an item can swap a tag at the limit. Moves no status and no ' +
        'recommendation. All or nothing, in one transaction: an unknown id, a blank name in ' +
        `\`add\`, one over ${MAX_LENGTH.tag} characters or a vacancy passing its limit of ` +
        `${TAGS_PER_VACANCY_MAX} tags writes none of them. Returns { success: true }. Max ` +
        `${ANALYSIS_BATCH_MAX} items per call.`,
      inputSchema: {
        items: z
          .array(
            z.object({
              vacancyId: z.number().int(),
              add: TagNamesSchema,
              remove: TagNamesSchema,
            }),
          )
          .min(1)
          .max(ANALYSIS_BATCH_MAX),
      },
    },
    withDomainErrors(async ({ items }) => {
      await tags.tagVacancies(userId, items);
      return json({ success: true });
    }),
  );
}
