import type { ApplicationStatus, PrismaClient } from '@prisma/client';
import { Prisma } from '@prisma/client';
import type {
  ApplicationListItem,
  ListApplicationsFilters,
  ListApplicationsResult,
  RecordApplicationInput,
  RecordApplicationResult,
  RecordManyApplicationsResult,
  VacancyResolution,
} from './application.types';
import { isById } from './application.types';
import {
  AmbiguousVacancyMatchError,
  ApplicationAlreadyExistsError,
  InvalidApplicationInputError,
} from './errors';
import { getPrisma } from './prisma-client';
import { deriveRecommendationFromScore } from './recommendation';

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
    statusComment: row.statusComment,
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

function slug(value: string): string {
  return (
    value
      .trim()
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, '-')
      .replace(/^-+|-+$/g, '') || 'x'
  );
}

/** Stand-in applyUrl for a vacancy the user applied to but never had a real listing URL for.
 * Not a real URL — the /tracker page renders these as plain text, not a link. Exported so
 * the tracker importer can detect two rows that would resolve to the same synthetic URL. */
export function buildSyntheticApplyUrl(company: string, title: string, date: Date): string {
  return `tracker://${slug(company)}/${slug(title)}/${date.toISOString().slice(0, 10)}`;
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
    const where: Prisma.ApplicationWhereInput = {
      ...(filters.status && { status: filters.status }),
      ...(filters.search && {
        estimatedVacancy: {
          OR: [
            { company: { contains: filters.search, mode: 'insensitive' } },
            { title: { contains: filters.search, mode: 'insensitive' } },
          ],
        },
      }),
    };

    const take = filters.limit ?? 50;
    const skip = filters.offset ?? 0;

    const [rows, total] = await Promise.all([
      this.db.application.findMany({
        where,
        orderBy: { appliedAt: 'desc' },
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
   * updateUserAction). `statusComment`, when given, is *appended* to whatever is
   * already stored — joined with " / " — not overwritten; a plain single column
   * standing in for a history table until one is actually needed.
   */
  async updateStatus(
    id: number,
    status: ApplicationStatus,
    statusComment?: string,
  ): Promise<ApplicationListItem | null> {
    try {
      const data: Prisma.ApplicationUpdateInput = { status, statusUpdatedAt: new Date() };
      const note = statusComment?.trim();
      if (note) {
        const current = await this.db.application.findUnique({
          where: { id },
          select: { statusComment: true },
        });
        if (!current) return null;
        data.statusComment = current.statusComment ? `${current.statusComment} / ${note}` : note;
      }
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

  const matches = await db.estimatedVacancy.findMany({
    where: {
      company: { equals: company, mode: 'insensitive' },
      title: { equals: title, mode: 'insensitive' },
    },
    select: { id: true },
  });

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
  try {
    const created = await db.estimatedVacancy.create({
      data: {
        company,
        title,
        applyUrl: input.applyUrl?.trim() || buildSyntheticApplyUrl(company, title, appliedAt),
        fullText: input.fullText ?? 'N/A',
        matchScore,
        recommendation,
        estimationComment: input.estimationComment ?? 'N/A',
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
          `(${input.applyUrl?.trim() || buildSyntheticApplyUrl(company, title, appliedAt)}) already belongs ` +
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
      status: input.status ?? 'APPLIED',
      salaryInListing: input.salaryInListing?.trim() || null,
      usedTailoredResume: input.usedTailoredResume ?? false,
      userComment: input.userComment?.trim() || null,
    },
    include: APPLICATION_INCLUDE,
  });

  return { application: flatten(row), resolution, vacancyCreated };
}
