import type { ApplicationStatus, PrismaClient } from '@prisma/client';
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
  AmbiguousVacancyMatchError,
  ApplicationAlreadyExistsError,
  InvalidApplicationInputError,
} from './errors';
import { escapeLikePattern } from './like';
import { PLACEHOLDER_COMMENT } from './placeholder';
import { getPrisma } from './prisma-client';
import { deriveRecommendationFromScore } from './recommendation';
import { buildSyntheticApplyUrl, normalizeApplyUrl } from './url';

/** The EstimatedVacancy fields the /tracker page reads through the join. */
const VACANCY_SELECT = {
  company: true,
  title: true,
  applyUrl: true,
  matchScore: true,
  recommendation: true,
  estimationComment: true,
} satisfies Prisma.EstimatedVacancySelect;

const APPLICATION_INCLUDE = {
  estimatedVacancy: { select: VACANCY_SELECT },
  // Oldest first; `id` breaks the tie between notes migrated with one shared date.
  comments: {
    select: { id: true, createdAt: true, body: true },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  },
} satisfies Prisma.ApplicationInclude;

type ApplicationRow = Prisma.ApplicationGetPayload<{ include: typeof APPLICATION_INCLUDE }>;

/** Any Prisma client or interactive-transaction client — the record path runs the
 * same way whether it's a single call or one row of an import batch. */
type Db = PrismaClient | Prisma.TransactionClient;

function flatten(row: ApplicationRow): ApplicationListItem {
  const ev = row.estimatedVacancy;
  return {
    id: row.id,
    appliedAt: row.appliedAt,
    status: row.status,
    statusUpdatedAt: row.statusUpdatedAt,
    comments: row.comments,
    salaryInListing: row.salaryInListing,
    usedTailoredResume: row.usedTailoredResume,
    userComment: row.userComment,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    estimatedVacancyId: row.estimatedVacancyId,
    company: ev.company,
    title: ev.title,
    applyUrl: ev.applyUrl,
    matchScore: ev.matchScore,
    recommendation: ev.recommendation,
    estimationComment: ev.estimationComment,
  };
}

export class ApplicationService {
  /** @param db defaults (on construction, not import) to the lazy process-wide client —
   *   same rationale as EstimatedVacancyService. Nest passes its managed client. */
  constructor(private readonly db: PrismaClient = getPrisma()) {}

  /**
   * Record that the user applied to a role. In one transaction: resolve the vacancy
   * (link by id, link to a unique (company,title) match, or create a minimal
   * placeholder-filled row), flip that vacancy's userAction to APPLIED, and create
   * the Application. Throws a DomainError on blank input, an unknown id, an ambiguous
   * (company,title) match, or a vacancy that already has an application.
   */
  record(input: RecordApplicationInput): Promise<RecordApplicationResult> {
    return this.db.$transaction((tx) => recordWithin(tx, input));
  }

  /**
   * Record a whole batch atomically — one transaction, all rows or none. A thrown
   * row rolls everything back, so a failed import leaves nothing and is safe to retry.
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

  async getById(id: number): Promise<ApplicationListItem | null> {
    const row = await this.db.application.findUnique({
      where: { id },
      include: APPLICATION_INCLUDE,
    });
    return row ? flatten(row) : null;
  }

  async list(filters: ListApplicationsFilters = {}): Promise<ListApplicationsResult> {
    // search/company/title each contribute one clause against the linked vacancy;
    // AND-ed together so giving more than one narrows (a caller normally gives just
    // one — search is the /tracker free-text box, company/title are the MCP tool —
    // but composing them via AND rather than clobbering keeps it well-defined either way).
    // Escaped like the vacancy service's: these are the same free-text terms over
    // the same two columns, reached through the join.
    const vacancyFilters: Prisma.EstimatedVacancyWhereInput[] = [];
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

    const where: Prisma.ApplicationWhereInput = {
      ...(filters.status && { status: filters.status }),
      ...(vacancyFilters.length > 0 && { estimatedVacancy: { AND: vacancyFilters } }),
    };

    const take = filters.limit ?? 50;
    const skip = filters.offset ?? 0;

    const [rows, total] = await Promise.all([
      this.db.application.findMany({
        where,
        // `appliedAt` alone is not a total order: the importer stamps a whole batch
        // with one timestamp, so ties are normal. Offset paging over a tie has no
        // defined window — the same row can be served by two pages and another
        // skipped — so `id` breaks the tie. The web's log loader reads this list as
        // consecutive pages (phase 2.2, step 2).
        orderBy: [{ appliedAt: 'desc' }, { id: 'desc' }],
        take,
        skip,
        include: APPLICATION_INCLUDE,
      }),
      this.db.application.count({ where }),
    ]);

    return { items: rows.map(flatten), total };
  }

  /**
   * Returns null when no application has this id (P2025 — same pattern as
   * updateUserAction). `statusComment`, when given, becomes a new `Comment` row in
   * the same write — the timeline is append-only (ADR-0028).
   */
  async updateStatus(
    id: number,
    status: ApplicationStatus,
    statusComment?: string,
  ): Promise<ApplicationListItem | null> {
    const note = statusComment?.trim();
    return this.updateRow(id, {
      status,
      statusUpdatedAt: new Date(),
      ...(note && { comments: { create: { body: note } } }),
    });
  }

  /**
   * Edit what was entered when applying — the apply modal re-opened. A field left
   * out is untouched; a blank string clears it. Returns null for an unknown id.
   */
  update(id: number, input: UpdateApplicationInput): Promise<ApplicationListItem | null> {
    const text = (value: string | null | undefined) =>
      value === undefined ? undefined : value?.trim() || null;
    return this.updateRow(id, {
      salaryInListing: text(input.salaryInListing),
      usedTailoredResume: input.usedTailoredResume,
      userComment: text(input.userComment),
    });
  }

  /**
   * Append a note to the timeline at any time, without a status move (ADR-0028).
   * Returns null for an unknown id; a blank body is an InvalidApplicationInputError.
   */
  async addComment(id: number, body: string): Promise<ApplicationListItem | null> {
    const note = body.trim();
    if (!note) throw new InvalidApplicationInputError('comment body is blank');
    return this.updateRow(id, { comments: { create: { body: note } } });
  }

  /** One update, returned flattened; null when no application has this id (P2025 —
   * same pattern as updateUserAction). */
  private async updateRow(
    id: number,
    data: Prisma.ApplicationUpdateInput,
  ): Promise<ApplicationListItem | null> {
    try {
      const row = await this.db.application.update({
        where: { id },
        data,
        include: APPLICATION_INCLUDE,
      });
      return flatten(row);
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
        return null;
      }
      throw err;
    }
  }

  /**
   * Same as updateStatus, but for a caller that only knows (company, title) — the
   * natural shape for an agent reading e.g. a rejection/offer email, which has no
   * internal Application id. Resolves the same way record()'s by-vacancy path does:
   * a unique case-insensitive (company, title) match against EstimatedVacancy, then
   * follows the 1:1 back-relation to its Application. Returns null when nothing
   * matches, or when a matching vacancy exists but was never actually recorded as
   * applied (call record_application first — this method never creates anything).
   * Throws AmbiguousVacancyMatchError for 2+ matches, same as record().
   */
  async updateStatusByVacancy(
    company: string,
    title: string,
    status: ApplicationStatus,
    statusComment?: string,
  ): Promise<ApplicationListItem | null> {
    const trimmedCompany = company.trim();
    const trimmedTitle = title.trim();
    if (!trimmedCompany || !trimmedTitle) {
      throw new InvalidApplicationInputError('company and title are required');
    }

    const matches = await findVacancyMatches(this.db, trimmedCompany, trimmedTitle);
    if (matches.length > 1) {
      throw new AmbiguousVacancyMatchError(
        `"${trimmedCompany}" / "${trimmedTitle}" matches ${matches.length} analyzed vacancies ` +
          `(ids: ${matches.map((m) => m.id).join(', ')}). Pass id to disambiguate.`,
      );
    }
    if (matches.length === 0) {
      return null;
    }

    const application = await this.db.application.findUnique({
      where: { estimatedVacancyId: matches[0].id },
      select: { id: true },
    });
    if (!application) {
      return null;
    }

    return this.updateStatus(application.id, status, statusComment);
  }
}

/** Case-insensitive (company, title) match against EstimatedVacancy — shared by the
 * record-or-create path and updateStatusByVacancy. */
function findVacancyMatches(db: Db, company: string, title: string): Promise<{ id: number }[]> {
  return db.estimatedVacancy.findMany({
    where: {
      company: { equals: company, mode: 'insensitive' },
      title: { equals: title, mode: 'insensitive' },
    },
    select: { id: true },
  });
}

async function resolveVacancyId(
  db: Db,
  input: RecordApplicationInput,
  appliedAt: Date,
): Promise<{ vacancyId: number; resolution: VacancyResolution; vacancyCreated: boolean }> {
  if (isById(input)) {
    const vacancy = await db.estimatedVacancy.findUnique({
      where: { id: input.estimatedVacancyId },
      select: { id: true },
    });
    if (!vacancy) {
      throw new InvalidApplicationInputError(
        `EstimatedVacancy ${input.estimatedVacancyId} not found`,
      );
    }
    return { vacancyId: vacancy.id, resolution: 'linked-by-id', vacancyCreated: false };
  }

  const company = input.company.trim();
  const title = input.title.trim();
  if (!company || !title) {
    throw new InvalidApplicationInputError('company and title are required');
  }

  const matches = await findVacancyMatches(db, company, title);

  if (matches.length === 1) {
    return { vacancyId: matches[0].id, resolution: 'linked-existing', vacancyCreated: false };
  }
  if (matches.length > 1) {
    throw new AmbiguousVacancyMatchError(
      `"${company}" / "${title}" matches ${matches.length} analyzed vacancies ` +
        `(ids: ${matches.map((m) => m.id).join(', ')}). Pass estimatedVacancyId to disambiguate.`,
    );
  }

  const matchScore = input.matchScore ?? 0;
  const recommendation =
    input.recommendation ??
    (input.matchScore != null ? deriveRecommendationFromScore(input.matchScore) : 'APPLY');
  // Neutralized, not stored raw: a non-http(s) scheme here would be rendered as a
  // clickable link by the web app. The record is kept either way — losing a whole
  // application over a bad URL would be worse than an unlinked one.
  const applyUrl =
    normalizeApplyUrl(input.applyUrl) ?? buildSyntheticApplyUrl(company, title, appliedAt);
  try {
    const created = await db.estimatedVacancy.create({
      data: {
        company,
        title,
        applyUrl,
        fullText: input.fullText ?? PLACEHOLDER_COMMENT,
        matchScore,
        recommendation,
        estimationComment: input.estimationComment ?? PLACEHOLDER_COMMENT,
        userAction: 'APPLIED',
        userActionUpdatedAt: new Date(),
      },
      select: { id: true },
    });
    return { vacancyId: created.id, resolution: 'created-vacancy', vacancyCreated: true };
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
  db: Db,
  input: RecordApplicationInput,
): Promise<RecordApplicationResult> {
  const appliedAt = input.appliedAt ?? new Date();
  const { vacancyId, resolution, vacancyCreated } = await resolveVacancyId(db, input, appliedAt);

  const existing = await db.application.findUnique({
    where: { estimatedVacancyId: vacancyId },
    select: { id: true },
  });
  if (existing) {
    throw new ApplicationAlreadyExistsError(
      `EstimatedVacancy ${vacancyId} already has application ${existing.id}`,
    );
  }

  // A freshly created vacancy is already APPLIED. An existing one we linked to may not be.
  if (!vacancyCreated) {
    await db.estimatedVacancy.updateMany({
      where: { id: vacancyId, userAction: { not: 'APPLIED' } },
      data: { userAction: 'APPLIED', userActionUpdatedAt: new Date() },
    });
  }

  const row = await db.application.create({
    data: {
      estimatedVacancyId: vacancyId,
      appliedAt,
      statusUpdatedAt: appliedAt,
      status: input.status ?? 'APPLIED',
      salaryInListing: input.salaryInListing?.trim() || null,
      usedTailoredResume: input.usedTailoredResume ?? false,
      userComment: input.userComment?.trim() || null,
    },
    include: APPLICATION_INCLUDE,
  });

  return { application: flatten(row), resolution, vacancyCreated };
}
