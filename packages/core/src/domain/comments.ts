import type { Prisma } from '@prisma/client';

/** Every comment, every source, oldest first; `id` breaks the tie between notes that
 * share a date. */
export const ALL_COMMENTS = {
  select: { id: true, createdAt: true, body: true, source: true },
  orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
} satisfies Prisma.Vacancy$commentsArgs;
