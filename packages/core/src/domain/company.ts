import type { Prisma } from '@prisma/client';
import type { UserDb } from '../db/for-user';
import { companyGroupKey } from './identity';

/**
 * "The same company" leaves `FILTERED_OUT` out — screened-out postings (most of them
 * the old log's, never analysed) are noise in "have I dealt with these people before?".
 * Both the `sameCompanyAs` list and `companyMatchCounts` apply it; a FILTERED_OUT row
 * adds itself back to its own count (`withDerivedFields`), so the button's "others" is
 * exactly the rows the modal lists, from any row.
 */
export const SAME_COMPANY_STATUSES: Prisma.VacancyWhereInput = {
  status: { not: 'FILTERED_OUT' },
};

// ponytail: both helpers below read every distinct company on each call — fine at a
// few hundred names per user; past that, store `companyGroupKey` in an indexed column,
// best together with company aliases (docs/backlog.md).

/** Every stored spelling of `company`'s company — the `sameCompanyAs` filter. */
export async function sameCompanyNames(db: UserDb, company: string): Promise<string[]> {
  const key = companyGroupKey(company);
  const rows = await db.vacancy.findMany({ distinct: ['company'], select: { company: true } });
  return rows.map((row) => row.company).filter((name) => companyGroupKey(name) === key);
}

/**
 * For each name, how many vacancies are the same company (`companyGroupKey`) — the
 * duplicates button's count, on /vacancies and /applications alike, and exactly the
 * rows `sameCompanyAs` lists: every status but `FILTERED_OUT` (`SAME_COMPANY_STATUSES`).
 */
export async function companyMatchCounts(
  db: UserDb,
  companies: string[],
): Promise<Map<string, number>> {
  if (companies.length === 0) {
    return new Map();
  }
  const groups = await db.vacancy.groupBy({
    by: ['company'],
    where: SAME_COMPANY_STATUSES,
    _count: { _all: true },
  });
  const perKey = new Map<string, number>();
  for (const group of groups) {
    const key = companyGroupKey(group.company);
    perKey.set(key, (perKey.get(key) ?? 0) + group._count._all);
  }
  return new Map(companies.map((name) => [name, perKey.get(companyGroupKey(name)) ?? 0]));
}
