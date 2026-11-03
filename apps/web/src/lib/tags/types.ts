// Runtime contract for a vacancy's tags. Same rules as ../vacancies/types.ts: zod is the
// single source of truth, and @job-search-copilot/core is NOT imported (invariant 5).
import { z } from 'zod';

const tagToneSchema = z.enum(['NEUTRAL', 'GOOD', 'WARN', 'BAD', 'ACCENT']);
export type TagTone = z.infer<typeof tagToneSchema>;

/** A tag as a vacancy carries it. */
export const tagRefSchema = z.object({
  id: z.number(),
  name: z.string(),
  tone: tagToneSchema,
});
export type TagRef = z.infer<typeof tagRefSchema>;
