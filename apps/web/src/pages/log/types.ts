// Runtime contract for GET /api/v1/log — hand-written, not a `core` import
// (ADR-0012; see vacancies/types.ts).
import { z } from 'zod';
import { cursorPageSchema } from '@/lib/api';

export const logEntrySchema = z.object({
  id: z.number(),
  createdAt: z.string(),
  url: z.string(),
  company: z.string().nullable(),
  title: z.string().nullable(),
});
export type LogEntry = z.infer<typeof logEntrySchema>;

export const logPageSchema = cursorPageSchema(logEntrySchema);
