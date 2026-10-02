import type { CommentSource, PrismaClient, VacancyStatus } from '@prisma/client';
import { Prisma } from '@prisma/client';
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
import {
  AlreadyAppliedError,
  AmbiguousVacancyMatchError,
  InvalidApplicationInputError,
} from './errors';
import { escapeLikePattern } from './like';
import { cursorArgs, toCursorPage } from './paging';
import { PLACEHOLDER_COMMENT } from './placeholder';
import { getPrisma } from './prisma-client';
import { deriveRecommendationFromScore } from './recommendation';
import {
  activeWhere,
  firstStatus,
  isTimedOut,
  PIPELINE_STATUSES,
  timedOutWhere,
  writeStatus,
} from './status';
import { applyUrlKey, buildSyntheticApplyUrl, normalizeApplyUrl } from './url';
import { ALL_COMMENTS, companyMatchCounts, sameCompanyNames } from './vacancy.service';

/** The Vacancy fields the /applications page reads. */
const APPLICATION_SELECT = {
  id: true,
  status: true,
  statusChangedAt: true,
  salaryInListing: true,
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

/** Any Prisma client or interactive-transaction client. */
type Db = PrismaClient | Prisma.TransactionClient;

const PIPELINE: VacancyStatus[] = [...PIPELINE_STATUSES];

/** `now` is the timeout clock's; a list passes the one its `where` used. */
function flatten({ statusChanges, ...row }: ApplicationRow, now = new Date()): ApplicationListItem {
  return {
    ...row,
    timedOut: isTimedOut(row.status, row.statusChangedAt, now),
    appliedAt: statusChanges[0]?.createdAt ?? null,
  };
}

/** A nested write that adds `body` to the vacancy as a `source` comment; nothing when
 * it is blank. */
function commentOn(
  body: string | null | undefined,
  source: CommentSource,
): Prisma.VacancyUpdateInput {
  const note = body?.trim();
  return note ? { comments: { create: { body: note, source } } } : {};
}

/** One update, returned flattened; null when no vacancy has this id (P2025 — let the
 * UPDATE fail rather than check first). */
async function updateRow(
  db: Db,
  id: number,
  data: Prisma.VacancyUpdateInput,
): Promise<ApplicationListItem | null> {
  try {
    return flatten(await db.vacancy.update({ where: { id }, data, select: APPLICATION_SELECT }));
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
      return null;
    }
    throw err;
  }
}

/**
 * /applications' view of the vacancies: those with a pipeline status. Not a second
 * status zone — applying moves the vacancy's own `status`, and `id` is the vacancy's.
 */
export class ApplicationService {
  /** @param db defaults (on construction, not import) to the lazy process-wide client —
   *   same rationale as VacancyService. Nest passes its managed client. */
  constructor(private readonly db: PrismaClient = getPrisma()) {}

  /**
   * Record that the user applied to a role. In one transaction: resolve the vacancy
   * (link by id, link to a unique (company,title) match, or create a minimal
   * placeholder-filled row), move it to APPLIED (then to `status`, if given), and set
   * salary / CV / comment. Throws a DomainError on blank input, an unknown id, an
   * ambiguous (company,title) match, or a vacancy already in the pipeline.
   */
  record(input: RecordApplicationInput): Promise<RecordApplicationResult> {
    return this.db.$transaction((tx) => recordWithin(tx, input));
  }

  /**
   * Record a whole batch atomically — one transaction, all rows or none. A thrown
   * row rolls everything back, so a failed batch leaves nothing and is safe to retry.
   */
  recordMany(inputs: RecordApplicationInput[]): Promise<RecordManyApplicationsResult> {
    return this.db.$transaction(async (tx) => {
      const results: RecordApplicationResult[] = [];
      for (const input of inputs) {
        results.push(await recordWithin(tx, input));
      }
      return { results };
    });
  }

  /** Null when no vacancy has this id, or it is not in the pipeline. */
  async getById(id: number): Promise<ApplicationListItem | null> {
    const row = await this.db.vacancy.findFirst({
      where: { id, status: { in: PIPELINE } },
      select: APPLICATION_SELECT,
    });
    return row ? flatten(row) : null;
  }

  async list(filters: ListApplicationsFilters = {}): Promise<ListApplicationsResult> {
    // search/company/title each contribute one clause; AND-ed together so giving more
    // than one narrows (a caller normally gives just one — search is the /applications
    // free-text box, company/title are the MCP tool — but composing them via AND
    // rather than clobbering keeps it well-defined either way). Escaped like the
    // vacancy service's: these are the same free-text terms over the same two columns.
    const vacancyFilters: Prisma.VacancyWhereInput[] = [];
    if (filters.search) {
      vacancyFilters.push({
        OR: [
          { company: { contains: escapeLikePattern(filters.search), mode: 'insensitive' } },
          { title: { contains: escapeLikePattern(filters.search), mode: 'insensitive' } },
        ],
      });
    }
    if (filters.company) {
      vacancyFilters.push({
        company: { contains: escapeLikePattern(filters.company), mode: 'insensitive' },
      });
    }
    if (filters.title) {
      vacancyFilters.push({
        title: { contains: escapeLikePattern(filters.title), mode: 'insensitive' },
      });
    }
    if (filters.sameCompanyAs) {
      vacancyFilters.push({
        company: { in: await sameCompanyNames(this.db, filters.sameCompanyAs) },
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
      this.db.vacancy.findMany({
        where,
        // The last move first — a fresh application tops the list; a comment or an
        // edit does not reorder. `statusChangedAt` alone is not a total order (a
        // migrated batch shares one date), and offset paging over a tie has no defined
        // window, so `id` breaks it — and Prisma's cursor needs a total order (ADR-0030).
        orderBy: [{ statusChangedAt: 'desc' }, { id: 'desc' }],
        ...(filters.offset && { skip: filters.offset }),
        ...cursorArgs(cursor, limit),
        select: APPLICATION_SELECT,
      }),
      this.db.vacancy.count({ where }),
    ]);

    const { items, nextCursor } = toCursorPage(rows, cursor, limit);
    const counts = await companyMatchCounts(
      this.db,
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
   * caller's: AGENT over MCP, USER over REST. Returns null when no vacancy has this id.
   */
  updateStatus(
    id: number,
    status: VacancyStatus,
    note: string | undefined,
    source: CommentSource,
  ): Promise<ApplicationListItem | null> {
    return this.db.$transaction(async (tx) => {
      await writeStatus(tx, id, status);
      return updateRow(tx, id, commentOn(note, source));
    });
  }

  /**
   * Edit what was entered when applying — the apply modal re-opened. A field left
   * out is untouched; a blank string clears it. A non-blank `comment` adds a USER
   * comment — it edits none. Returns null for an unknown id.
   */
  update(id: number, input: UpdateApplicationInput): Promise<ApplicationListItem | null> {
    const text = (value: string | null | undefined) =>
      value === undefined ? undefined : value?.trim() || null;
    return updateRow(this.db, id, {
      salaryInListing: text(input.salaryInListing),
      usedTailoredResume: input.usedTailoredResume,
      ...commentOn(input.comment, 'USER'),
    });
  }

  /**
   * Same as updateStatus, but for a caller that only knows (company, title) — the
   * natural shape for an agent reading e.g. a rejection/offer email, which has no
   * id. A unique case-insensitive (company, title) match among the vacancies already
   * applied to (PIPELINE_STATUSES) — an email about a vacancy never applied to is not
   * a status move, so it returns null and the agent routes the email to need-attention.
   * Returns null when nothing matches — it never creates anything. Throws
   * AmbiguousVacancyMatchError for 2+ matches.
   */
  async updateStatusByVacancy(
    company: string,
    title: string,
    status: VacancyStatus,
    note: string | undefined,
    source: CommentSource,
  ): Promise<ApplicationListItem | null> {
    const trimmedCompany = company.trim();
    const trimmedTitle = title.trim();
    if (!trimmedCompany || !trimmedTitle) {
      throw new InvalidApplicationInputError('company and title are required');
    }

    const matches = (await findVacancyMatches(this.db, trimmedCompany, trimmedTitle)).filter((m) =>
      PIPELINE.includes(m.status),
    );
    if (matches.length > 1) {
      throw new AmbiguousVacancyMatchError(
        `"${trimmedCompany}" / "${trimmedTitle}" matches ${matches.length} applied vacancies ` +
          `(ids: ${matches.map((m) => m.id).join(', ')}). Pass id to disambiguate.`,
      );
    }
    if (matches.length === 0) {
      return null;
    }

    return this.updateStatus(matches[0].id, status, note, source);
  }
}

/** Case-insensitive (company, title) match against Vacancy — shared by the
 * record-or-create path and updateStatusByVacancy. */
function findVacancyMatches(
  db: Db,
  company: string,
  title: string,
): Promise<{ id: number; status: VacancyStatus }[]> {
  return db.vacancy.findMany({
    where: {
      company: { equals: company, mode: 'insensitive' },
      title: { equals: title, mode: 'insensitive' },
    },
    select: { id: true, status: true },
  });
}

interface ResolvedVacancy {
  vacancy: { id: number; status: VacancyStatus };
  resolution: VacancyResolution;
  vacancyCreated: boolean;
}

async function resolveVacancy(
  db: Db,
  input: RecordApplicationInput,
  at: Date,
): Promise<ResolvedVacancy> {
  if (isById(input)) {
    const vacancy = await db.vacancy.findUnique({
      where: { id: input.vacancyId },
      select: { id: true, status: true },
    });
    if (!vacancy) {
      throw new InvalidApplicationInputError(`Vacancy ${input.vacancyId} not found`);
    }
    return { vacancy, resolution: 'linked-by-id', vacancyCreated: false };
  }

  const company = input.company.trim();
  const title = input.title.trim();
  if (!company || !title) {
    throw new InvalidApplicationInputError('company and title are required');
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

  const matchScore = input.matchScore ?? 0;
  const recommendation =
    input.recommendation ??
    (input.matchScore != null ? deriveRecommendationFromScore(input.matchScore) : 'APPLY');
  // Neutralized, not stored raw: a non-http(s) scheme here would be rendered as a
  // clickable link by the web app. The record is kept either way — losing a whole
  // application over a bad URL would be worse than an unlinked one.
  const applyUrl = normalizeApplyUrl(input.applyUrl) ?? buildSyntheticApplyUrl(company, title, at);
  const estimationComment = input.estimationComment?.trim();
  try {
    const created = await db.vacancy.create({
      data: {
        company,
        title,
        applyUrl,
        fullText: input.fullText ?? PLACEHOLDER_COMMENT,
        matchScore,
        recommendation,
        ...(estimationComment && {
          comments: { create: { body: estimationComment, source: 'ANALYZER' } },
        }),
        ...firstStatus(at),
      },
      select: { id: true, status: true },
    });
    return { vacancy: created, resolution: 'created-vacancy', vacancyCreated: true };
  } catch (err) {
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
  tx: Prisma.TransactionClient,
  input: RecordApplicationInput,
): Promise<RecordApplicationResult> {
  const at = new Date();
  const { vacancy, resolution, vacancyCreated } = await resolveVacancy(tx, input, at);

  if (PIPELINE.includes(vacancy.status)) {
    throw new AlreadyAppliedError(`Vacancy ${vacancy.id} is already ${vacancy.status}`);
  }

  // APPLIED first, so an application recorded further along still has its applied date.
  await writeStatus(tx, vacancy.id, 'APPLIED', at);
  if (input.status && input.status !== 'APPLIED') {
    await writeStatus(tx, vacancy.id, input.status, at);
  }

  const row = await tx.vacancy.update({
    where: { id: vacancy.id },
    data: {
      salaryInListing: input.salaryInListing?.trim() || null,
      usedTailoredResume: input.usedTailoredResume ?? false,
      ...commentOn(input.comment, 'USER'),
    },
    select: APPLICATION_SELECT,
  });
  return { application: flatten(row), resolution, vacancyCreated };
}
