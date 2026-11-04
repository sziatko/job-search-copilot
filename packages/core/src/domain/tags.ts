import type { Prisma } from '@prisma/client';
import type { UserTx } from '../db/for-user';
import { TAGS_PER_VACANCY_MAX, type TagRef } from '../tags/tag.types';
import { MAX_LENGTH } from '../vacancies/vacancy.types';
import { InvalidTagsError } from './errors';

/** What a read returns of a tag. */
export const TAG_REF = { id: true, name: true, tone: true } satisfies Prisma.TagSelect;

/** A vacancy's tags in `select` / `include`, ordered by name whatever its case; `withTags`
 * flattens the link rows. */
export const VACANCY_TAGS = {
  select: { tag: { select: TAG_REF } },
  orderBy: { tag: { nameKey: 'asc' } },
} satisfies Prisma.Vacancy$tagsArgs;

export function withTags<T extends { tags: { tag: TagRef }[] }>(
  row: T,
): Omit<T, 'tags'> & { tags: TagRef[] } {
  return { ...row, tags: row.tags.map((link) => link.tag) };
}

function tidy(name: string): string {
  return name.trim().replace(/\s+/g, ' ');
}

/** What makes two names one tag: trimmed, spaces collapsed, lower case. */
export function normalizeTagKey(name: string): string {
  return tidy(name).toLowerCase();
}

/** The columns of a name; InvalidTagsError when it is blank or too long. */
export function parseTagName(name: string): { name: string; nameKey: string } {
  const tidied = tidy(name);
  if (!tidied) throw new InvalidTagsError('A tag name must not be blank');
  if (tidied.length > MAX_LENGTH.tag) {
    // Cut: this message is logged and answered, and the body limit is 5 MB.
    const start = tidied.slice(0, MAX_LENGTH.tag);
    throw new InvalidTagsError(`A tag name is at most ${MAX_LENGTH.tag} characters: "${start}…"`);
  }
  return { name: tidied, nameKey: normalizeTagKey(tidied) };
}

/**
 * Locks the user's vacancies among `ids`, in id order, until the transaction ends; returns
 * the ids found. Raw, so it filters by `userId` itself: Prisma has no row lock. Every write
 * of tags takes its vacancies first and its tags after, so overlapping writes wait rather
 * than deadlock, and the count in `attachTags` cannot be raced. `NO KEY`: the strength of
 * the UPDATE in `writeAnalysis`, and it lets another write's foreign key check through.
 * `bigint[]`: an id past Int4 is simply not found, not a cast error and a 500.
 */
export async function lockVacancies(
  db: UserTx,
  userId: string,
  ids: number[],
): Promise<Set<number>> {
  const rows = await db.$queryRaw<{ id: number }[]>`
    SELECT id FROM "Vacancy" WHERE id = ANY(${ids}::bigint[]) AND "userId" = ${userId}
    ORDER BY id FOR NO KEY UPDATE`;
  return new Set(rows.map((row) => row.id));
}

/**
 * Creates the names not taken yet; returns their keys. A P2002 inside an interactive
 * transaction aborts it, so catching one cannot recover: `skipDuplicates` instead. Sorted
 * by key, so calls that overlap insert a new name in one order (a stable sort, so the first
 * spelling goes first and is the one kept). A write of several items calls this once with
 * all their names, before the items: item by item would break that order across them.
 */
export async function createTags(db: UserTx, userId: string, names: string[]): Promise<string[]> {
  if (names.length === 0) return [];
  const tags = names
    .map(parseTagName)
    .sort((x, y) => (x.nameKey < y.nameKey ? -1 : x.nameKey > y.nameKey ? 1 : 0));
  await db.tag.createMany({
    data: tags.map((tag) => ({ ...tag, userId })),
    skipDuplicates: true,
  });
  return tags.map((tag) => tag.nameKey);
}

/**
 * Puts the named tags on a vacancy of this user's, in the caller's transaction, which holds
 * the vacancy's row lock (`lockVacancies`, or `writeAnalysis`'s UPDATE), creating the names
 * not taken yet. Over TAGS_PER_VACANCY_MAX in total it throws, so the transaction writes
 * nothing. Four queries, whatever the number of names.
 *
 * Limit: a new name is `GREY`, and a tag renamed by the user comes back under its old
 * name if a machine repeats that name. Past that: nothing in the server; the skill's rule
 * is to take the names from `list_tags` (ADR-0042).
 *
 * Limit: a tag renamed or deleted between the `createMany` and the link's insert is not
 * attached, or fails as a 500 (P2003), with nothing written. A user's click against a write
 * of a few milliseconds. Past that: lock the tags too.
 */
export async function attachTags(
  db: UserTx,
  userId: string,
  vacancyId: number,
  names: string[],
): Promise<void> {
  if (names.length === 0) return;
  const nameKeys = await createTags(db, userId, names);
  const tags = await db.tag.findMany({
    where: { nameKey: { in: nameKeys } },
    orderBy: { nameKey: 'asc' },
    select: { id: true },
  });
  await db.vacancyTag.createMany({
    data: tags.map((tag) => ({ vacancyId, tagId: tag.id, userId })),
    skipDuplicates: true,
  });
  if ((await db.vacancyTag.count({ where: { vacancyId } })) > TAGS_PER_VACANCY_MAX) {
    throw new InvalidTagsError(
      `Vacancy ${vacancyId} would have more than ${TAGS_PER_VACANCY_MAX} tags`,
    );
  }
}
