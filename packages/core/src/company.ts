import type { Prisma } from '@prisma/client';
import type { UserDb } from './for-user';
import { normalizeCompanyKey } from './vacancy-intake';

// Matched after normalizeCompanyKey's collapse, the way it matches legal forms: a
// trailing country or region names an office, not another company.
const PLACE_SUFFIX =
  / (?:polska|poland|spain|españa|espana|latam|germany|deutschland|uk|usa|ukraine|netherlands|emea|europe)$/;

/**
 * Same company ⇔ equal keys (ADR-0032), so every spelling of a company sees the same
 * rows and the same count. The log's key (case, punctuation, legal forms), with a note
 * in parentheses (`Fabrikam (partner company)`) and a trailing country
 * (`contoso Polska`) dropped too. A name that is nothing but those keeps itself.
 */
export function companyKey(company: string): string {
  let key = normalizeCompanyKey(company.replace(/\([^)]*\)/g, ' ')) ?? '';
  // `Acme Polska Sp. z o.o.` carries both, in either order.
  for (let prev = ''; prev !== key; ) {
    prev = key;
    key = normalizeCompanyKey(key.replace(PLACE_SUFFIX, '')) ?? '';
  }
  return key || company.trim().toLowerCase();
}

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
// few hundred names; past that, store `companyKey` in an indexed column.

/** Every stored spelling of `company`'s company — the `sameCompanyAs` filter. */
export async function sameCompanyNames(db: UserDb, company: string): Promise<string[]> {
  const key = companyKey(company);
  const rows = await db.vacancy.findMany({ distinct: ['company'], select: { company: true } });
  return rows.map((row) => row.company).filter((name) => companyKey(name) === key);
}

/**
 * For each name, how many vacancies are the same company (`companyKey`) — the
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
    const key = companyKey(group.company);
    perKey.set(key, (perKey.get(key) ?? 0) + group._count._all);
  }
  return new Map(companies.map((name) => [name, perKey.get(companyKey(name)) ?? 0]));
}
