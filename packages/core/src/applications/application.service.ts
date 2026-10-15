import type { CommentSource, PrismaClient, Recommendation, VacancyStatus } from '@prisma/client';
import { Prisma } from '@prisma/client';
import { forUser, orNotFound, type UserDb, type UserTx } from '../db/for-user';
import { textFilters } from '../db/like';
import { cursorArgs, toCursorPage } from '../db/paging';
import { getPrisma } from '../db/prisma-client';
import { ALL_COMMENTS } from '../domain/comments';
import { companyMatchCounts, sameCompanyNames } from '../domain/company';
import {
  AlreadyAppliedError,
  AmbiguousVacancyMatchError,
  InvalidApplicationInputError,
  VacancyNotFoundError,
} from '../domain/errors';
import { matchKeys } from '../domain/identity';
import { deriveRecommendationFromScore } from '../domain/recommendation';
import {
  activeWhere,
  commentOn,
  firstStatus,
  isTimedOut,
  PIPELINE_STATUSES,
  timedOutWhere,
  writeStatus,
} from '../domain/status';
import { applyUrlKey, buildSyntheticApplyUrl, normalizeApplyUrl } from '../domain/url';
import type {
  ApplicationListItem,
  ListApplicationsFilters,
  ListApplicationsResult,
  RecordApplicationInput,
  RecordApplicationResult,
  RecordManyApplicationsResult,
  UpdateApplicationInput,
  VacancyResolution,
} from './application.types';
import { isById } from './application.types';

/** The Vacancy fields the /applications page reads. */
const APPLICATION_SELECT = {
  id: true,
  status: true,
  statusChangedAt: true,
  salaryInApplication: true,
  usedTailoredResume: true,
  company: true,
  title: true,
  applyUrl: true,
  matchScore: true,
  recommendation: true,
  comments: ALL_COMMENTS,
  // appliedAt: the latest APPLIED row — a vacancy can be applied to, set back, and
  // applied to again.
  statusChanges: {
    where: { status: 'APPLIED' },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: 1,
    select: { createdAt: true },
  },
} satisfies Prisma.VacancySelect;

type ApplicationRow = Prisma.VacancyGetPayload<{ select: typeof APPLICATION_SELECT }>;

/** A scoped client or its interactive transaction. */
type Db = UserDb | UserTx;

const PIPELINE: VacancyStatus[] = [...PIPELINE_STATUSES];

/** `now` is the timeout clock's; a list passes the one its `where` used. */
function flatten({ statusChanges, ...row }: ApplicationRow, now = new Date()): ApplicationListItem {
  return {
    ...row,
    timedOut: isTimedOut(row.status, row.statusChangedAt, now),
    appliedAt: statusChanges[0]?.createdAt ?? null,
  };
}

/** One update, returned flattened; VacancyNotFoundError when no vacancy of this user has
 * this id (`orNotFound`). */
async function updateRow(
  db: Db,
  id: number,
  data: Prisma.VacancyUpdateInput,
): Promise<ApplicationListItem> {
  return flatten(
    await orNotFound(db.vacancy.update({ where: { id }, data, select: APPLICATION_SELECT }), id),
  );
}

/**
 * /applications' view of the vacancies: those with a pipeline status. Not a second
 * status zone — applying moves the vacancy's own `status`, and `id` is the vacancy's.
 */
export class ApplicationService {
  /** @param db only ever used through `forUser` (every public method takes the user's id
   *   first, ADR-0038). Defaults (on construction, not import) to the lazy process-wide client —
   *   same rationale as VacancyService. Nest passes its managed client. */
  constructor(private readonly db: PrismaClient = getPrisma()) {}

  /**
   * Record that the user applied to a role. In one transaction: resolve the vacancy
   * (link by id, link to a unique (company,title) match, or create a minimal
   * placeholder row, unanalysed unless given a score), move it to APPLIED (then to
   * `status`, if given), and set salary / CV / comment. Throws a DomainError on blank
   * input, an unknown id, an ambiguous (company,title) match, or a vacancy already in
   * the pipeline.
   */
  record(userId: string, input: RecordApplicationInput): Promise<RecordApplicationResult> {
    return forUser(this.db, userId).$transaction((db) => recordWithin(db, userId, input));
  }

  /**
   * Record a whole batch atomically — one transaction, all rows or none. A thrown
   * row rolls everything back, so a failed batch leaves nothing and is safe to retry.
   */
  recordMany(
    userId: string,
    inputs: RecordApplicationInput[],
  ): Promise<RecordManyApplicationsResult> {
    return forUser(this.db, userId).$transaction(async (db) => {
      const results: RecordApplicationResult[] = [];
      for (const input of inputs) {
        results.push(await recordWithin(db, userId, input));
      }
      return { results };
    });
  }

  /** Null when no vacancy has this id, or it is not in the pipeline. */
  async getById(userId: string, id: number): Promise<ApplicationListItem | null> {
    const row = await forUser(this.db, userId).vacancy.findFirst({
      where: { id, status: { in: PIPELINE } },
      select: APPLICATION_SELECT,
    });
    return row ? flatten(row) : null;
  }

  async list(
    userId: string,
    filters: ListApplicationsFilters = {},
  ): Promise<ListApplicationsResult> {
    const db = forUser(this.db, userId);
    // Every clause narrows: AND-ed together, so giving more than one is well-defined.
    const vacancyFilters = textFilters(filters);
    if (filters.sameCompanyAs) {
      vacancyFilters.push({
        company: { in: await sameCompanyNames(db, filters.sameCompanyAs) },
      });
    }
    // One clock for the filter and each item's flag, so a row cannot match
    // `timedOut` and come back `timedOut: false`.
    const now = new Date();
    if (filters.state) {
      vacancyFilters.push(filters.state === 'active' ? activeWhere(now) : timedOutWhere(now));
    }

    const where: Prisma.VacancyWhereInput = {
      status: { in: filters.status ? [filters.status] : PIPELINE },
      ...(filters.applyUrl !== undefined && { applyUrl: applyUrlKey(filters.applyUrl) }),
      ...(vacancyFilters.length > 0 && { AND: vacancyFilters }),
    };

    const limit = filters.limit ?? 50;
    const { cursor } = filters;

    const [rows, total] = await Promise.all([
      db.vacancy.findMany({
        where,
        // The last move first — a fresh application tops the list; a comment or an
        // edit does not reorder. `statusChangedAt` alone is not a total order (rows
        // can share one date), and offset paging over a tie has no defined
        // window, so `id` breaks it — and Prisma's cursor needs a total order (ADR-0030).
        orderBy: [{ statusChangedAt: 'desc' }, { id: 'desc' }],
        ...(filters.offset && { skip: filters.offset }),
        ...cursorArgs(cursor, limit),
        select: APPLICATION_SELECT,
      }),
      db.vacancy.count({ where }),
    ]);

    const { items, nextCursor } = toCursorPage(rows, cursor, limit);
    const counts = await companyMatchCounts(
      db,
      items.map((row) => row.company),
    );
    return {
      items: items.map((row) => ({
        ...flatten(row, now),
        companyMatchCount: counts.get(row.company) ?? 0,
      })),
      total,
      nextCursor,
    };
  }

  /**
   * Moves the vacancy to `status` through writeStatus — any status, triage included; a
   * repeated pipeline status is an event, a repeated triage one throws SameStatusError.
   * `note`, when not blank, becomes a new `source`
   * comment in the same transaction. `source` is the
   * caller's: AGENT over MCP, USER over REST. Throws VacancyNotFoundError for an unknown id.
   */
  updateStatus(
    userId: string,
    id: number,
    status: VacancyStatus,
    note: string | undefined,
    source: CommentSource,
  ): Promise<ApplicationListItem> {
    return forUser(this.db, userId).$transaction(async (db) => {
      await writeStatus(db, id, status);
      return updateRow(db, id, commentOn(note, source));
    });
  }

  /**
   * Edit what was entered when applying — the apply modal re-opened. A field left
   * out is untouched; a blank string clears it. A non-blank `comment` adds a USER
   * comment — it edits none. Throws VacancyNotFoundError for an unknown id.
   */
  update(userId: string, id: number, input: UpdateApplicationInput): Promise<ApplicationListItem> {
    const text = (value: string | null | undefined) =>
      value === undefined ? undefined : value?.trim() || null;
    return updateRow(forUser(this.db, userId), id, {
      salaryInApplication: text(input.salaryInApplication),
      usedTailoredResume: input.usedTailoredResume,
      ...commentOn(input.comment, 'USER'),
    });
  }

  /**
   * A new dated `source` comment on any vacancy, no status move. Earlier comments are
   * never changed. Throws InvalidApplicationInputError for a blank body,
   * VacancyNotFoundError for an unknown id.
   */
  async addComment(
    userId: string,
    id: number,
    body: string,
    source: CommentSource,
  ): Promise<ApplicationListItem> {
    if (!body.trim()) {
      throw new InvalidApplicationInputError('`body` must not be blank.');
    }
    return updateRow(forUser(this.db, userId), id, commentOn(body, source));
  }

  /**
   * Same as updateStatus, but for a caller that only knows (company, title) — the
   * natural shape for an agent reading e.g. a rejection/offer email, which has no
   * id. A unique (company, title) match by name (`findVacancyMatches`) among the
   * vacancies already applied to (PIPELINE_STATUSES) — an email about a vacancy never applied to is not
   * a status move, so it is not found and the agent routes the email to need-attention.
   * Throws VacancyNotFoundError when nothing matches — it never creates anything — and
   * AmbiguousVacancyMatchError for 2+ matches.
   */
  async updateStatusByVacancy(
    userId: string,
    company: string,
    title: string,
    status: VacancyStatus,
    note: string | undefined,
    source: CommentSource,
  ): Promise<ApplicationListItem> {
    const trimmedCompany = company.trim();
    const trimmedTitle = title.trim();
    if (!trimmedCompany || !trimmedTitle) {
      throw new InvalidApplicationInputError('company and title are required');
    }

    const matches = (
      await findVacancyMatches(forUser(this.db, userId), trimmedCompany, trimmedTitle)
    ).filter((m) => PIPELINE.includes(m.status));
    if (matches.length > 1) {
      throw new AmbiguousVacancyMatchError(
        `"${trimmedCompany}" / "${trimmedTitle}" matches ${matches.length} applied vacancies ` +
          `(ids: ${matches.map((m) => m.id).join(', ')}). Pass id to disambiguate.`,
      );
    }
    if (matches.length === 0) {
      throw new VacancyNotFoundError(`"${trimmedCompany}" / "${trimmedTitle}" not found`);
    }

    return this.updateStatus(userId, matches[0].id, status, note, source);
  }
}

/** The same posting by name — equal (companyKey, titleKey), as intake matches it
 * (`identity.ts`): case, punctuation and legal forms aside. A name that normalizes to
 * nothing matches nothing. Shared by the record-or-create path and
 * updateStatusByVacancy. */
async function findVacancyMatches(
  db: Db,
  company: string,
  title: string,
): Promise<{ id: number; status: VacancyStatus }[]> {
  const { companyKey, titleKey } = matchKeys(company, title);
  if (!companyKey || !titleKey) {
    return [];
  }
  return db.vacancy.findMany({
    where: { companyKey, titleKey },
    select: { id: true, status: true },
  });
}

interface ResolvedVacancy {
  vacancy: { id: number; status: VacancyStatus };
  resolution: VacancyResolution;
  vacancyCreated: boolean;
  /** A created vacancy's analysis, written once the row has left NEW — the DB refuses
   * an analysis on a NEW row (ADR-0033). Absent when there is none. */
  analysis?: { matchScore: number; recommendation: Recommendation };
}

async function resolveVacancy(
  db: UserTx,
  userId: string,
  input: RecordApplicationInput,
  at: Date,
): Promise<ResolvedVacancy> {
  if (isById(input)) {
    const vacancy = await db.vacancy.findUnique({
      where: { id: input.vacancyId },
      select: { id: true, status: true },
    });
    if (!vacancy) {
      throw new VacancyNotFoundError(`Vacancy ${input.vacancyId} not found`);
    }
    return { vacancy, resolution: 'linked-by-id', vacancyCreated: false };
  }

  const company = input.company.trim();
  const title = input.title.trim();
  if (!company || !title) {
    throw new InvalidApplicationInputError('company and title are required');
  }

  // The url first, as intake matches: a known link is the vacancy whatever its name's
  // spelling. A miss (the email's link is the company's ATS, the vacancy's is LinkedIn)
  // falls through to the name. Neutralized, not stored raw: a non-http(s) scheme here
  // would be rendered as a clickable link by the web app.
  const url = normalizeApplyUrl(input.applyUrl);
  const byUrl =
    url &&
    (await db.vacancy.findUnique({
      where: { userId_applyUrl: { userId, applyUrl: url } },
      select: { id: true, status: true },
    }));
  if (byUrl) {
    return { vacancy: byUrl, resolution: 'linked-existing', vacancyCreated: false };
  }

  const matches = await findVacancyMatches(db, company, title);

  if (matches.length === 1) {
    return { vacancy: matches[0], resolution: 'linked-existing', vacancyCreated: false };
  }
  if (matches.length > 1) {
    throw new AmbiguousVacancyMatchError(
      `"${company}" / "${title}" matches ${matches.length} analyzed vacancies ` +
        `(ids: ${matches.map((m) => m.id).join(', ')}). Pass vacancyId to disambiguate.`,
    );
  }

  // No analysis unless the caller passed a score: the CHECK wants both fields or neither.
  const analysis =
    input.matchScore == null
      ? undefined
      : {
          matchScore: input.matchScore,
          recommendation: input.recommendation ?? deriveRecommendationFromScore(input.matchScore),
        };
  // The record is kept without a usable url — losing a whole application over a bad
  // URL would be worse than an unlinked one.
  const applyUrl = url ?? buildSyntheticApplyUrl(company, title, at);
  const estimationComment = input.estimationComment?.trim();
  try {
    const created = await db.vacancy.create({
      data: {
        userId,
        company,
        title,
        applyUrl,
        ...matchKeys(company, title),
        fullText: input.fullText?.trim() ? input.fullText : null,
        ...(estimationComment && {
          comments: { create: { body: estimationComment, source: 'ANALYZER' } },
        }),
        ...firstStatus(at),
      },
      select: { id: true, status: true },
    });
    return { vacancy: created, resolution: 'created-vacancy', vacancyCreated: true, analysis };
  } catch (err) {
    // The url was looked up above, so only a concurrent write gets here.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      throw new InvalidApplicationInputError(
        `Could not create a vacancy for "${company}" / "${title}": its applyUrl ` +
          `(${applyUrl}) already belongs ` +
          `to another vacancy.`,
      );
    }
    throw err;
  }
}

async function recordWithin(
  db: UserTx,
  userId: string,
  input: RecordApplicationInput,
): Promise<RecordApplicationResult> {
  const at = new Date();
  const { vacancy, resolution, vacancyCreated, analysis } = await resolveVacancy(
    db,
    userId,
    input,
    at,
  );

  if (PIPELINE.includes(vacancy.status)) {
    throw new AlreadyAppliedError(`Vacancy ${vacancy.id} is already ${vacancy.status}`);
  }

  // APPLIED first, so an application recorded further along still has its applied date.
  await writeStatus(db, vacancy.id, 'APPLIED', at);
  if (input.status && input.status !== 'APPLIED') {
    await writeStatus(db, vacancy.id, input.status, at);
  }

  const row = await db.vacancy.update({
    where: { id: vacancy.id },
    data: {
      salaryInApplication: input.salaryInApplication?.trim() || null,
      usedTailoredResume: input.usedTailoredResume ?? false,
      ...analysis,
      ...commentOn(input.comment, 'USER'),
    },
    select: APPLICATION_SELECT,
  });
  return { application: flatten(row), resolution, vacancyCreated };
}
