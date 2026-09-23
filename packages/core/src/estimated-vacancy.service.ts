import type { EstimatedVacancy, PrismaClient, UserAction } from '@prisma/client';
import { Prisma } from '@prisma/client';
import type {
  EstimatedVacancyListItem,
  ListEstimatedVacanciesFilters,
  ListEstimatedVacanciesResult,
  SaveEstimatedVacancyInput,
  SaveEstimatedVacancyResult,
  SaveManyEstimatedVacanciesResult,
} from './estimated-vacancy.types';
import { getPrisma } from './prisma-client';
import { normalizeRecommendation } from './recommendation';
import { buildSyntheticApplyUrl, normalizeApplyUrl } from './url';

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
    // Neutralized *before* the dedup lookup, not at the insert: applyUrl is the key,
    // so a sanitized insert against an unsanitized lookup would miss its own row and
    // trip the unique constraint. A bad scheme costs the link, never the analysis —
    // postings are scraped from the open web and are untrusted input.
    const applyUrl =
      normalizeApplyUrl(input.applyUrl) ??
      buildSyntheticApplyUrl(input.company, input.title, new Date());

    const existing = await this.db.estimatedVacancy.findUnique({ where: { applyUrl } });
    if (existing) {
      return { created: false, vacancy: existing };
    }

    const recommendation = normalizeRecommendation(input.recommendation);
    try {
      const vacancy = await this.db.estimatedVacancy.create({
        data: {
          company: input.company,
          title: input.title,
          applyUrl,
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
  async saveMany(inputs: SaveEstimatedVacancyInput[]): Promise<SaveManyEstimatedVacanciesResult> {
    const results: SaveEstimatedVacancyResult[] = [];
    for (const input of inputs) {
      results.push(await this.save(input));
    }
    return { results };
  }

  async getById(id: number): Promise<EstimatedVacancy | null> {
    return this.db.estimatedVacancy.findUnique({ where: { id } });
  }

  /** List/search — omits fullText to keep results compact. Use getById for the full record. */
  async list(filters: ListEstimatedVacanciesFilters = {}): Promise<ListEstimatedVacanciesResult> {
    const where: Prisma.EstimatedVacancyWhereInput = {
      ...(filters.recommendation && { recommendation: filters.recommendation }),
      ...(filters.userAction && { userAction: filters.userAction }),
      // One clause, not two: `search` is the /vacancies free-text box and widens
      // (company OR title), where company/title each narrow. Being separate `where`
      // keys they AND together, so passing both still means "must satisfy both".
      ...(filters.search && {
        OR: [
          { company: { contains: filters.search, mode: 'insensitive' } },
          { title: { contains: filters.search, mode: 'insensitive' } },
        ],
      }),
      ...(filters.company && {
        company: { contains: filters.company, mode: 'insensitive' },
      }),
      ...(filters.title && {
        title: { contains: filters.title, mode: 'insensitive' },
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

    return { items: await this.withCompanyMatchCounts(items), total };
  }

  /**
   * Adds the derived `companyMatchCount` to a page of rows: for each row, how many
   * vacancies in the whole table have a `company` containing that row's company
   * (case-insensitive substring — the /vacancies duplicates button, ADR-0025).
   */
  private async withCompanyMatchCounts(
    items: Omit<EstimatedVacancyListItem, 'companyMatchCount'>[],
  ): Promise<EstimatedVacancyListItem[]> {
    const names = [...new Set(items.map((item) => item.company))];
    if (names.length === 0) {
      return [];
    }

    // Prefilter so the scan below only sees candidates. One OR over the page's
    // distinct companies is exactly what the `company` trigram index serves. It can
    // over-select — Prisma's `contains` does not escape LIKE's `%`/`_`, so a company
    // called `A_B` also reaches `AXB` — but it can never under-select, which is why
    // the count itself is done in JS.
    //
    // ponytail: a second round-trip plus an O(distinct companies x candidates) scan
    // on every list call. Fine while a page is a hundred rows; if the table grows,
    // do the counting in SQL (a lateral join over the same index) instead of pulling
    // candidate company names into the process.
    const candidates = await this.db.estimatedVacancy.findMany({
      where: { OR: names.map((name) => ({ company: { contains: name, mode: 'insensitive' } })) },
      select: { company: true },
    });

    const counts = new Map<string, number>();
    for (const name of names) {
      const needle = name.toLowerCase();
      counts.set(
        name,
        candidates.filter((candidate) => candidate.company.toLowerCase().includes(needle)).length,
      );
    }

    return items.map((item) => ({ ...item, companyMatchCount: counts.get(item.company) ?? 0 }));
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
