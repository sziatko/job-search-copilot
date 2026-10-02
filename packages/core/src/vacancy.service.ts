import type { PrismaClient, VacancyStatus } from '@prisma/client';
import { Prisma } from '@prisma/client';
import { escapeLikePattern } from './like';
import { cursorArgs, toCursorPage } from './paging';
import { getPrisma } from './prisma-client';
import { normalizeRecommendation } from './recommendation';
import { firstStatus, writeStatus } from './status';
import { applyUrlKey, buildSyntheticApplyUrl, normalizeApplyUrl } from './url';
import type {
  ListVacanciesFilters,
  ListVacanciesResult,
  SaveManyVacanciesResult,
  SaveVacancyInput,
  SaveVacancyResult,
  VacancyDetail,
  VacancyListItem,
  VacancySort,
} from './vacancy.types';
import { normalizeCompanyKey } from './vacancy-log';

/** The analyzer's comment: the first `ANALYZER` row. A relation read, so every
 * reader selects it through here and flattens it with `withEstimation`. */
const ANALYZER_COMMENT = {
  where: { source: 'ANALYZER' },
  orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  take: 1,
  select: { body: true },
} satisfies Prisma.Vacancy$commentsArgs;

function withEstimation<T extends { comments: { body: string }[] }>(
  row: T,
): Omit<T, 'comments'> & { estimationComment: string | null } {
  const { comments, ...rest } = row;
  return { ...rest, estimationComment: comments[0]?.body ?? null };
}

/** Every comment, every source, oldest first; `id` breaks the tie between notes migrated
 * with one shared date. */
export const ALL_COMMENTS = {
  select: { id: true, createdAt: true, body: true, source: true },
  orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
} satisfies Prisma.Vacancy$commentsArgs;

const DETAIL_INCLUDE = {
  comments: ALL_COMMENTS,
  statusChanges: {
    select: { status: true, createdAt: true },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  },
} satisfies Prisma.VacancyInclude;

/** The row with all its comments, plus the analyzer's (the first `ANALYZER` one)
 * flattened out as `estimationComment`, and the status journal as `timeline`. */
function toDetail({
  statusChanges,
  ...row
}: Prisma.VacancyGetPayload<{ include: typeof DETAIL_INCLUDE }>): VacancyDetail {
  return {
    ...row,
    estimationComment: row.comments.find((c) => c.source === 'ANALYZER')?.body ?? null,
    timeline: statusChanges,
  };
}

/** Each sort ends on `id`, so the order is total — Prisma's cursor needs that (ADR-0030). */
const ORDER_BY = {
  newest: [{ createdAt: 'desc' }, { id: 'desc' }],
  recommended: [{ recommendation: 'asc' }, { matchScore: 'desc' }, { id: 'desc' }],
} satisfies Record<VacancySort, Prisma.VacancyOrderByWithRelationInput[]>;

const LIST_SELECT = {
  id: true,
  createdAt: true,
  updatedAt: true,
  company: true,
  title: true,
  applyUrl: true,
  matchScore: true,
  recommendation: true,
  comments: ANALYZER_COMMENT,
  status: true,
  statusChangedAt: true,
} satisfies Prisma.VacancySelect;

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

// ponytail: both helpers below read every distinct company on each call — fine at a
// few hundred names; past that, store `companyKey` in an indexed column.

/** Every stored spelling of `company`'s company — the `sameCompanyAs` filter. */
export async function sameCompanyNames(db: PrismaClient, company: string): Promise<string[]> {
  const key = companyKey(company);
  const rows = await db.vacancy.findMany({ distinct: ['company'], select: { company: true } });
  return rows.map((row) => row.company).filter((name) => companyKey(name) === key);
}

/**
 * For each name, how many vacancies are the same company (`companyKey`) — the
 * duplicates button's count, on /vacancies and /applications alike, and exactly the
 * rows `sameCompanyAs` lists. Every vacancy counts, whatever its status: the modal
 * lists them all.
 */
export async function companyMatchCounts(
  db: PrismaClient,
  companies: string[],
): Promise<Map<string, number>> {
  if (companies.length === 0) {
    return new Map();
  }
  const groups = await db.vacancy.groupBy({ by: ['company'], _count: { _all: true } });
  const perKey = new Map<string, number>();
  for (const group of groups) {
    const key = companyKey(group.company);
    perKey.set(key, (perKey.get(key) ?? 0) + group._count._all);
  }
  return new Map(companies.map((name) => [name, perKey.get(companyKey(name)) ?? 0]));
}

export class VacancyService {
  /**
   * @param db PrismaClient to run against. Defaults (evaluated on construction, not
   *   import) to the lazy process-wide client so DI-less entrypoints (the MCP server)
   *   can `new` this directly; Nest passes its lifecycle-managed PrismaService client.
   */
  constructor(private readonly db: PrismaClient = getPrisma()) {}

  /**
   * Persist a freshly analyzed vacancy, keyed by applyUrl. A vacancy is analyzed
   * once: if a row with this applyUrl already exists it is returned untouched and
   * the incoming analysis is discarded (re-analysis is not a supported flow — see
   * the T6 decision). `created` tells the caller which happened. The unique
   * constraint on applyUrl is the real guard; the pre-check just avoids a
   * guaranteed-failing insert on the common path.
   */
  async save(input: SaveVacancyInput): Promise<SaveVacancyResult> {
    // Neutralized *before* the dedup lookup, not at the insert: applyUrl is the key,
    // so a sanitized insert against an unsanitized lookup would miss its own row and
    // trip the unique constraint. A bad scheme costs the link, never the analysis —
    // postings are scraped from the open web and are untrusted input.
    const applyUrl =
      normalizeApplyUrl(input.applyUrl) ??
      buildSyntheticApplyUrl(input.company, input.title, new Date());

    const existing = await this.db.vacancy.findUnique({ where: { applyUrl } });
    if (existing) {
      return { created: false, vacancy: existing };
    }

    const recommendation = normalizeRecommendation(input.recommendation);
    const estimationComment = input.estimationComment.trim();
    try {
      const vacancy = await this.db.vacancy.create({
        data: {
          company: input.company,
          title: input.title,
          applyUrl,
          fullText: input.fullText,
          matchScore: input.matchScore,
          recommendation,
          ...(estimationComment && {
            comments: { create: { body: estimationComment, source: 'ANALYZER' } },
          }),
          ...firstStatus(new Date()),
        },
      });
      return { created: true, vacancy };
    } catch (err) {
      // Lost a race with a concurrent save of the same applyUrl — the other write won.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        const raced = await this.db.vacancy.findUnique({
          where: { applyUrl },
        });
        if (raced) {
          return { created: false, vacancy: raced };
        }
      }
      throw err;
    }
  }

  /**
   * Save a batch, one applyUrl-dedup save() per item. Not wrapped in a transaction,
   * unlike ApplicationService.recordMany: each save() is already self-contained (its
   * own P2002 race handling), and partial progress across a batch is what we want —
   * one bad item shouldn't roll back the good ones.
   */
  async saveMany(inputs: SaveVacancyInput[]): Promise<SaveManyVacanciesResult> {
    const results: SaveVacancyResult[] = [];
    for (const input of inputs) {
      results.push(await this.save(input));
    }
    return { results };
  }

  async getById(id: number): Promise<VacancyDetail | null> {
    const row = await this.db.vacancy.findUnique({ where: { id }, include: DETAIL_INCLUDE });
    return row ? toDetail(row) : null;
  }

  /** List/search — omits fullText to keep results compact. Use getById for the full record. */
  async list(filters: ListVacanciesFilters = {}): Promise<ListVacanciesResult> {
    // Every term below reaches the pattern unescaped by the caller, so it is
    // escaped here: `%`/`_` are the user's literal characters, not wildcards
    // (escapeLikePattern). It happens per clause rather than once up front because
    // each clause escapes a *different* value.
    const where: Prisma.VacancyWhereInput = {
      ...(filters.recommendation && { recommendation: filters.recommendation }),
      ...(filters.status?.length && { status: { in: filters.status } }),
      ...(filters.applyUrl !== undefined && { applyUrl: applyUrlKey(filters.applyUrl) }),
      // One clause, not two: `search` is the /vacancies free-text box and widens
      // (company OR title), where company/title each narrow. Being separate `where`
      // keys they AND together, so passing both still means "must satisfy both".
      ...(filters.search && {
        OR: [
          { company: { contains: escapeLikePattern(filters.search), mode: 'insensitive' } },
          { title: { contains: escapeLikePattern(filters.search), mode: 'insensitive' } },
        ],
      }),
      ...(filters.company && {
        company: { contains: escapeLikePattern(filters.company), mode: 'insensitive' },
      }),
      ...(filters.title && {
        title: { contains: escapeLikePattern(filters.title), mode: 'insensitive' },
      }),
      // Under AND, so it narrows `company` rather than replacing it.
      ...(filters.sameCompanyAs && {
        AND: [{ company: { in: await sameCompanyNames(this.db, filters.sameCompanyAs) } }],
      }),
    };

    const limit = filters.limit ?? 20;
    const { cursor } = filters;

    const [rows, total] = await Promise.all([
      this.db.vacancy.findMany({
        where,
        orderBy: ORDER_BY[filters.sort ?? 'newest'],
        ...(filters.offset && { skip: filters.offset }),
        ...cursorArgs(cursor, limit),
        select: LIST_SELECT,
      }),
      this.db.vacancy.count({ where }),
    ]);

    const { items, nextCursor } = toCursorPage(rows, cursor, limit);
    return { items: await this.withDerivedFields(items.map(withEstimation)), total, nextCursor };
  }

  /**
   * Adds the two derived fields a list item carries — neither is a column, and
   * both are computed on every list call because they are read from the page that
   * came back rather than from the database:
   *
   * - `companyMatchCount`: see `companyMatchCounts`.
   * - `hasAnalysis`: whether the analyzer ever saw the posting — whether it has an
   *   `ANALYZER` comment (see the type's own comment for the ceiling). One place
   *   decides this, which is the point: before it, the modal inferred it from the
   *   applyUrl's scheme, /vacancies rendered a `0%` for the same row, and the
   *   dashboard counted it as analysed.
   */
  private async withDerivedFields(
    items: Omit<VacancyListItem, 'companyMatchCount' | 'hasAnalysis'>[],
  ): Promise<VacancyListItem[]> {
    const counts = await companyMatchCounts(
      this.db,
      items.map((item) => item.company),
    );
    return items.map((item) => ({
      ...item,
      companyMatchCount: counts.get(item.company) ?? 0,
      hasAnalysis: item.estimationComment !== null,
    }));
  }

  /** Moves the vacancy to `status` through writeStatus — a repeated pipeline status is
   * an event, a repeated triage one throws SameStatusError. Returns null when no vacancy
   * has this id. */
  updateStatus(id: number, status: VacancyStatus): Promise<VacancyDetail | null> {
    return this.db.$transaction(async (tx) => {
      await writeStatus(tx, id, status);
      const row = await tx.vacancy.findUnique({ where: { id }, include: DETAIL_INCLUDE });
      return row ? toDetail(row) : null;
    });
  }
}
