import type { PrismaClient, Recommendation, Vacancy, VacancyStatus } from '@prisma/client';
import { Prisma } from '@prisma/client';
import { ALL_COMMENTS } from './comments';
import { companyMatchCounts, SAME_COMPANY_STATUSES, sameCompanyNames } from './company';
import { AlreadyAnalysedError, VacancyNotFoundError } from './errors';
import { forUser, orNull, type UserDb, type UserTx } from './for-user';
import { textFilters } from './like';
import { cursorArgs, toCursorPage } from './paging';
import { getPrisma } from './prisma-client';
import { normalizeRecommendation } from './recommendation';
import { commentOn, firstStatus, statusAfterAnalysis, writeStatus } from './status';
import { applyUrlKey, buildSyntheticApplyUrl, normalizeApplyUrl } from './url';
import type {
  ListVacanciesFilters,
  ListVacanciesResult,
  SaveManyVacanciesResult,
  SaveVacancyInput,
  SaveVacancyResult,
  SubmitAnalysisInput,
  VacancyDetail,
  VacancyListItem,
  VacancySort,
} from './vacancy.types';
import { normalizeCompanyKey, normalizeTitleKey } from './vacancy-intake';

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

/** Each sort ends on `id`, so the order is total — Prisma's cursor needs that (ADR-0030).
 * An unanalysed row (both fields null) sorts after every analysed one: Postgres puts
 * NULL last on `asc`, and `matchScore` is only null where `recommendation` is. */
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

interface Analysis {
  matchScore: number;
  recommendation: Recommendation;
  estimationComment: string;
  /** Filled in when the row has no text yet; never replaces one. */
  fullText?: string;
}

function toAnalysis(input: Omit<SubmitAnalysisInput, 'id'>): Analysis {
  return {
    matchScore: input.matchScore,
    recommendation: normalizeRecommendation(input.recommendation),
    estimationComment: input.estimationComment,
  };
}

/**
 * Writes an analysis onto an unanalysed row, in the caller's transaction — the one
 * writer of an analysis on `Vacancy` (save()'s created and attached rows,
 * submitAnalysis); the analysis is written once (ADR-0033).
 *
 * The conditional write comes first (`recommendation IS NULL`, a no-op `updatedAt`): it
 * takes the row lock, so a concurrent analysis of the same row waits for this one and
 * then finds it analysed. From NEW the rule's status follows, before the analysis — the
 * DB refuses an analysis on a NEW row and neither CHECK is deferrable. Any other status
 * (a pipeline placeholder) is left as it is.
 */
async function writeAnalysis(
  db: UserTx,
  id: number,
  analysis: Analysis,
  at: Date,
): Promise<Vacancy> {
  const [row] = await db.vacancy.updateManyAndReturn({
    where: { id, recommendation: null },
    data: { updatedAt: at },
    select: { status: true, fullText: true },
  });
  if (!row) {
    // Scoped, so another user's id is not found — never "already analysed".
    throw (await db.vacancy.count({ where: { id } })) > 0
      ? new AlreadyAnalysedError(`Vacancy ${id} is already analysed`)
      : new VacancyNotFoundError(`Vacancy ${id} not found`);
  }
  if (row.status === 'NEW') {
    await writeStatus(db, id, statusAfterAnalysis(analysis.recommendation), at);
  }
  const estimationComment = analysis.estimationComment.trim();
  return db.vacancy.update({
    where: { id },
    data: {
      matchScore: analysis.matchScore,
      recommendation: analysis.recommendation,
      ...(row.fullText === null && analysis.fullText?.trim() && { fullText: analysis.fullText }),
      ...(estimationComment && {
        comments: { create: { body: estimationComment, source: 'ANALYZER' } },
      }),
    },
  });
}

/**
 * Adds the three derived fields a list item carries — none is a column, and
 * all are computed on every list call because they are read from the page that
 * came back rather than from the database:
 *
 * - `companyMatchCount`: see `companyMatchCounts`.
 * - `hasAnalysis`: whether the vacancy has an analysis — `recommendation` is set
 *   (ADR-0033; the CHECK keeps `matchScore` in step). One place decides this: before
 *   it, the modal inferred it from the applyUrl's scheme, /vacancies rendered a `0%`
 *   for the same row, and the dashboard counted it as analysed.
 * - `hasText`: `fullText IS NOT NULL`, asked of the page's ids — the list never
 *   selects the text itself, which can be large (TOAST).
 */
async function withDerivedFields(
  db: UserDb,
  items: Omit<VacancyListItem, 'companyMatchCount' | 'hasAnalysis' | 'hasText'>[],
): Promise<VacancyListItem[]> {
  const [counts, withText] = await Promise.all([
    companyMatchCounts(
      db,
      items.map((item) => item.company),
    ),
    db.vacancy.findMany({
      where: { id: { in: items.map((item) => item.id) }, fullText: { not: null } },
      select: { id: true },
    }),
  ]);
  const textIds = new Set(withText.map((row) => row.id));
  return items.map((item) => ({
    ...item,
    // A FILTERED_OUT row is not among the counted rows, but the count includes the
    // row itself (`others = count − 1`), so it adds itself back.
    companyMatchCount: (counts.get(item.company) ?? 0) + (item.status === 'FILTERED_OUT' ? 1 : 0),
    hasAnalysis: item.recommendation !== null,
    hasText: textIds.has(item.id),
  }));
}

/**
 * Every public method takes the acting user's id first and sees only that user's
 * vacancies (`forUser`, ADR-0038): another user's id reads as an unknown one.
 */
export class VacancyService {
  /**
   * @param db PrismaClient to run against, only ever through `forUser`. Defaults
   *   (evaluated on construction, not import) to the lazy process-wide client so DI-less
   *   entrypoints (the MCP server) can `new` this directly; Nest passes its
   *   lifecycle-managed PrismaService client.
   */
  constructor(private readonly db: PrismaClient = getPrisma()) {}

  /**
   * Persist a freshly analyzed vacancy, keyed by applyUrl. The analysis is written once
   * (ADR-0005, ADR-0033):
   * - no row with this applyUrl → created (`created: true`);
   * - a row without an analysis (taken in by intake) → the analysis is attached to it,
   *   and the posting text when the row has none (`attached: true`);
   * - a row with one → returned untouched, the incoming analysis discarded (both false).
   * The unique constraint on applyUrl is the real guard; the pre-check just avoids a
   * guaranteed-failing insert on the common path.
   *
   * Either way the analysis goes through writeAnalysis: a new row's journal is NEW, then
   * the rule's status (`statusAfterAnalysis`), in one transaction and both dated now.
   */
  async save(userId: string, input: SaveVacancyInput): Promise<SaveVacancyResult> {
    const db = forUser(this.db, userId);
    // Neutralized *before* the dedup lookup, not at the insert: applyUrl is the key,
    // so a sanitized insert against an unsanitized lookup would miss its own row and
    // trip the unique constraint. A bad scheme costs the link, never the analysis —
    // postings are scraped from the open web and are untrusted input.
    const applyUrl =
      normalizeApplyUrl(input.applyUrl) ??
      buildSyntheticApplyUrl(input.company, input.title, new Date());

    const where = { userId_applyUrl: { userId, applyUrl } };
    const existing = await db.vacancy.findUnique({ where });
    if (existing && existing.recommendation !== null) {
      return { created: false, attached: false, vacancy: existing };
    }

    const analysis = { ...toAnalysis(input), fullText: input.fullText };
    const at = new Date();
    if (existing) {
      const vacancy = await db.$transaction((db) => writeAnalysis(db, existing.id, analysis, at));
      return { created: false, attached: true, vacancy };
    }
    try {
      const vacancy = await db.$transaction(async (db) => {
        const { id } = await db.vacancy.create({
          data: {
            userId,
            company: input.company,
            title: input.title,
            applyUrl,
            companyKey: normalizeCompanyKey(input.company),
            titleKey: normalizeTitleKey(input.title),
            fullText: input.fullText,
            ...firstStatus(at),
          },
          select: { id: true },
        });
        return writeAnalysis(db, id, analysis, at);
      });
      return { created: true, attached: false, vacancy };
    } catch (err) {
      // Lost a race with a concurrent save of the same applyUrl — the other write won.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        const raced = await db.vacancy.findUnique({ where });
        if (raced) {
          return { created: false, attached: false, vacancy: raced };
        }
      }
      throw err;
    }
  }

  /**
   * Writes the analysis of a vacancy that exists and has none (ADR-0033) — the queue's
   * way back in. From NEW it moves the vacancy by the rule (`SKIP` → FILTERED_OUT, else
   * NOT_REVIEWED, both journaled); any other status is untouched. Throws
   * AlreadyAnalysedError when it has one (nothing written), VacancyNotFoundError for an
   * unknown id.
   */
  submitAnalysis(userId: string, { id, ...input }: SubmitAnalysisInput): Promise<Vacancy> {
    return forUser(this.db, userId).$transaction((db) =>
      writeAnalysis(db, id, toAnalysis(input), new Date()),
    );
  }

  /** submitAnalysis for several, in order and in one transaction: one failure (already
   * analysed, unknown id, a bad recommendation) writes none of them. The transports cap
   * a batch at ANALYSIS_BATCH_MAX. */
  submitAnalyses(userId: string, inputs: SubmitAnalysisInput[]): Promise<Vacancy[]> {
    return forUser(this.db, userId).$transaction(async (db) => {
      const at = new Date();
      const rows: Vacancy[] = [];
      for (const { id, ...input } of inputs) {
        rows.push(await writeAnalysis(db, id, toAnalysis(input), at));
      }
      return rows;
    });
  }

  /**
   * Save a batch, one applyUrl-dedup save() per item. Not wrapped in a transaction,
   * unlike ApplicationService.recordMany: each save() is already self-contained (its
   * own P2002 race handling), and partial progress across a batch is what we want —
   * one bad item shouldn't roll back the good ones.
   */
  async saveMany(userId: string, inputs: SaveVacancyInput[]): Promise<SaveManyVacanciesResult> {
    const results: SaveVacancyResult[] = [];
    for (const input of inputs) {
      results.push(await this.save(userId, input));
    }
    return { results };
  }

  async getById(userId: string, id: number): Promise<VacancyDetail | null> {
    const row = await forUser(this.db, userId).vacancy.findUnique({
      where: { id },
      include: DETAIL_INCLUDE,
    });
    return row ? toDetail(row) : null;
  }

  /** List/search — omits fullText to keep results compact. Use getById for the full record. */
  async list(userId: string, filters: ListVacanciesFilters = {}): Promise<ListVacanciesResult> {
    const db = forUser(this.db, userId);
    // Under one AND, so `sameCompanyAs` narrows a `company` term rather than replacing it.
    const and = [
      ...textFilters(filters),
      ...(filters.sameCompanyAs
        ? [
            { company: { in: await sameCompanyNames(db, filters.sameCompanyAs) } },
            SAME_COMPANY_STATUSES,
          ]
        : []),
    ];
    const where: Prisma.VacancyWhereInput = {
      ...(filters.recommendation && { recommendation: filters.recommendation }),
      ...(filters.status?.length && { status: { in: filters.status } }),
      ...(filters.applyUrl !== undefined && { applyUrl: applyUrlKey(filters.applyUrl) }),
      ...(filters.hasText !== undefined && {
        fullText: filters.hasText ? { not: null } : null,
      }),
      // Only when non-empty: the cursor below treats an empty `where` as its own case.
      ...(and.length > 0 && { AND: and }),
    };

    const limit = filters.limit ?? 20;
    const { cursor } = filters;

    const [rows, total] = await Promise.all([
      db.vacancy.findMany({
        // Prisma pages a nullable sort (`recommended`) in memory from the cursor row, and
        // finds nothing when that row has left the filter (triaged out of NOT_REVIEWED).
        // The cursor row is kept in the result so it is always found; toCursorPage drops
        // it (an empty `where` matches every row already — Prisma reads `{}` in an OR as
        // false). ponytail: that in-memory path reads every row after the cursor, not
        // one page — fine at a few thousand rows; past that, a hand-written keyset.
        where:
          cursor === undefined || Object.keys(where).length === 0
            ? where
            : { OR: [where, { id: cursor }] },
        orderBy: ORDER_BY[filters.sort ?? 'newest'],
        ...(filters.offset && { skip: filters.offset }),
        ...cursorArgs(cursor, limit),
        select: LIST_SELECT,
      }),
      db.vacancy.count({ where }),
    ]);

    const { items, nextCursor } = toCursorPage(rows, cursor, limit);
    return { items: await withDerivedFields(db, items.map(withEstimation)), total, nextCursor };
  }

  /** Moves the vacancy to `status` through writeStatus — a repeated pipeline status is
   * an event, a repeated triage one throws SameStatusError. `comment`, when not blank,
   * becomes a USER comment in the same transaction (Save for later's note). Returns null
   * when no vacancy has this id. */
  updateStatus(
    userId: string,
    id: number,
    status: VacancyStatus,
    comment?: string,
  ): Promise<VacancyDetail | null> {
    return forUser(this.db, userId).$transaction(async (db) => {
      await writeStatus(db, id, status);
      const data = commentOn(comment, 'USER');
      const row = await orNull(db.vacancy.update({ where: { id }, data, include: DETAIL_INCLUDE }));
      return row && toDetail(row);
    });
  }
}
