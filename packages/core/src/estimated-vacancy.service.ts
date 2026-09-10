import type { EstimatedVacancy, PrismaClient, UserAction } from '@prisma/client';
import { Prisma } from '@prisma/client';
import type {
  ListEstimatedVacanciesFilters,
  ListEstimatedVacanciesResult,
  SaveEstimatedVacancyInput,
  SaveEstimatedVacancyResult,
} from './estimated-vacancy.types';
import { getPrisma } from './prisma-client';
import { normalizeRecommendation } from './recommendation';

const LIST_SELECT = {
  id: true,
  createdAt: true,
  updatedAt: true,
  company: true,
  title: true,
  applyUrl: true,
  matchScore: true,
  recommendation: true,
  estimationComment: true,
  userAction: true,
  userActionUpdatedAt: true,
} satisfies Prisma.EstimatedVacancySelect;

export class EstimatedVacancyService {
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
  async save(input: SaveEstimatedVacancyInput): Promise<SaveEstimatedVacancyResult> {
    const existing = await this.db.estimatedVacancy.findUnique({
      where: { applyUrl: input.applyUrl },
    });
    if (existing) {
      return { created: false, vacancy: existing };
    }

    const recommendation = normalizeRecommendation(input.recommendation);
    try {
      const vacancy = await this.db.estimatedVacancy.create({
        data: {
          company: input.company,
          title: input.title,
          applyUrl: input.applyUrl,
          fullText: input.fullText,
          matchScore: input.matchScore,
          recommendation,
          estimationComment: input.estimationComment,
        },
      });
      return { created: true, vacancy };
    } catch (err) {
      // Lost a race with a concurrent save of the same applyUrl — the other write won.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        const raced = await this.db.estimatedVacancy.findUnique({
          where: { applyUrl: input.applyUrl },
        });
        if (raced) {
          return { created: false, vacancy: raced };
        }
      }
      throw err;
    }
  }

  async getById(id: number): Promise<EstimatedVacancy | null> {
    return this.db.estimatedVacancy.findUnique({ where: { id } });
  }

  /** List/search — omits fullText to keep results compact. Use getById for the full record. */
  async list(filters: ListEstimatedVacanciesFilters = {}): Promise<ListEstimatedVacanciesResult> {
    const where: Prisma.EstimatedVacancyWhereInput = {
      ...(filters.recommendation && { recommendation: filters.recommendation }),
      ...(filters.userAction && { userAction: filters.userAction }),
      ...(filters.company && {
        company: { contains: filters.company, mode: 'insensitive' },
      }),
    };

    const take = filters.limit ?? 20;
    const skip = filters.offset ?? 0;

    const [items, total] = await Promise.all([
      this.db.estimatedVacancy.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take,
        skip,
        select: LIST_SELECT,
      }),
      this.db.estimatedVacancy.count({ where }),
    ]);

    return { items, total };
  }

  /**
   * Returns null when no vacancy has this id. One round-trip: let the UPDATE fail
   * with Prisma's "record not found" (P2025) rather than a separate existence check
   * that also leaves a TOCTOU gap.
   */
  async updateUserAction(id: number, userAction: UserAction): Promise<EstimatedVacancy | null> {
    try {
      return await this.db.estimatedVacancy.update({
        where: { id },
        data: { userAction, userActionUpdatedAt: new Date() },
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
        return null;
      }
      throw err;
    }
  }
}
