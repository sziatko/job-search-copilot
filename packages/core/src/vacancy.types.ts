import type { CommentSource, Recommendation, Vacancy, VacancyStatus } from '@prisma/client';

export interface VacancyComment {
  id: number;
  createdAt: Date;
  body: string;
  source: CommentSource;
}

export interface SaveVacancyResult {
  /** false when a vacancy with this applyUrl already existed and was returned untouched. */
  created: boolean;
  vacancy: Vacancy;
}

/** getById / updateStatus: the whole row and every comment, oldest first, plus the
 * analyzer's (the first `ANALYZER` one), or null when there is none; `timeline` is
 * every `StatusChange`, oldest first. */
export type VacancyDetail = Vacancy & {
  comments: VacancyComment[];
  estimationComment: string | null;
  timeline: { status: VacancyStatus; createdAt: Date }[];
};

export interface SaveManyVacanciesResult {
  results: SaveVacancyResult[];
}

export interface SaveVacancyInput {
  company: string;
  title: string;
  applyUrl: string;
  fullText: string;
  matchScore: number;
  /** Accepts the canonical English value or its Ukrainian equivalent — see recommendation.ts. */
  recommendation: string;
  /** Written as the vacancy's `ANALYZER` comment; a blank one writes none. */
  estimationComment: string;
}

export interface ListVacanciesFilters {
  recommendation?: Recommendation;
  /** Any of these (`IN`). */
  status?: VacancyStatus[];
  /** Matches company OR title, ILIKE '%term%', case-insensitive. For the /vacancies
   * page's single free-text search box. Independent of `company`/`title` — combined
   * with them via AND, not OR. */
  search?: string;
  /** ILIKE '%term%', case-insensitive. */
  company?: string;
  /** Every vacancy of this name's company, whatever its spelling (`companyKey`,
   * ADR-0032) — the company modal and the vacancy page's other vacancies. */
  sameCompanyAs?: string;
  /** Exact, after the same normalization `save` applies — see `applyUrlKey`. */
  applyUrl?: string;
  /** ILIKE '%term%', case-insensitive — mirrors `company`; both have a trigram GIN index. */
  title?: string;
  limit?: number;
  /** MCP's paging. Not with `cursor` — REST answers both with a 400. */
  offset?: number;
  /** The web's paging (ADR-0030): the `id` of the last row the caller has. */
  cursor?: number;
  /** Default `newest`. */
  sort?: VacancySort;
}

/** `newest`: `createdAt desc, id desc` — what `list_vacancies` promises.
 * `recommended`: `recommendation asc` (the enum's declaration order — APPLY,
 * APPLY_WITH_CAVEATS, SKIP), `matchScore desc, id desc` — the web's triage order. */
export const VACANCY_SORTS = ['newest', 'recommended'] as const;
export type VacancySort = (typeof VACANCY_SORTS)[number];

export interface ListVacanciesResult {
  items: VacancyListItem[];
  /** Rows matching the filter, not the page size. */
  total: number;
  /** The last item's `id` when more rows follow, else null. */
  nextCursor: number | null;
}

/** Lightweight shape for list/search results — omits fullText to keep responses small. */
export type VacancyListItem = {
  id: number;
  createdAt: Date;
  updatedAt: Date;
  company: string;
  title: string;
  applyUrl: string;
  matchScore: number;
  recommendation: Recommendation;
  /** The first `ANALYZER` comment's body; null when there is none. */
  estimationComment: string | null;
  status: VacancyStatus;
  statusChangedAt: Date;
  /**
   * How many vacancies have a `company` containing this row's `company` —
   * case-insensitive substring, the same semantics as the `company` filter, and
   * counting this row itself. Derived on every list call, not a column, so it is
   * absent from the single-record endpoints (`getById`, PATCH) — see ADR-0025.
   */
  companyMatchCount: number;
  /**
   * Whether the analyzer ever looked at this posting. Derived the same way, and
   * absent from the single-record endpoints for the same reason.
   *
   * The test is "an `ANALYZER` comment exists" (`estimationComment !== null`) —
   * there is no column for this. `save()` always writes one; a placeholder row
   * (ADR-0019) gets one only when `record_application` was given an
   * `estimationComment`. Ceiling, named where it is derived: such a placeholder
   * reads as analysed, and shows the score the caller passed, or 0.
   */
  hasAnalysis: boolean;
};
