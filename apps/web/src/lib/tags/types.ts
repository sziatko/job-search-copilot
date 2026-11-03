// Runtime contract for a vacancy's tags. Same rules as ../vacancies/types.ts: zod is the
// single source of truth, and @job-search-copilot/core is NOT imported (invariant 5).
import { z } from 'zod';

export const tagToneSchema = z.enum(['NEUTRAL', 'GOOD', 'WARN', 'BAD', 'ACCENT']);
export type TagTone = z.infer<typeof tagToneSchema>;

/** A tag as a vacancy carries it, and as `POST /tags` answers. */
export const tagRefSchema = z.object({
  id: z.number(),
  name: z.string(),
  tone: tagToneSchema,
});
export type TagRef = z.infer<typeof tagRefSchema>;

/** `GET /tags`: every tag of the user, by name. */
export const tagListSchema = z.array(tagRefSchema.extend({ vacancyCount: z.number() }));

/** One tag on or off one vacancy: a row write's variables (`useRowMutation` wants the `id`). */
export interface TagWrite {
  id: number;
  add?: TagRef;
  remove?: TagRef;
}

/** Core's `normalizeTagKey`: what makes two names one tag. */
export function tagKey(name: string): string {
  return name.trim().replace(/\s+/g, ' ').toLowerCase();
}

/** A row after a tag write, in the server's order, until the refetch brings the real one. */
export function withTagWrite<T extends { tags: TagRef[] }>(item: T, { add, remove }: TagWrite): T {
  const kept = item.tags.filter((tag) => tag.id !== add?.id && tag.id !== remove?.id);
  return {
    ...item,
    tags: (add ? [...kept, add] : kept).sort((a, b) =>
      tagKey(a.name).localeCompare(tagKey(b.name)),
    ),
  };
}
