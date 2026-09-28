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
 * analyzer's (the first `ANALYZER` one), or null when there is none. */
export type VacancyDetail = Vacancy & {
  comments: VacancyComment[];
  estimationComment: string | null;
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
  /** Exact, after the same normalization `save` applies — see `applyUrlKey`. */
  applyUrl?: string;
  /** ILIKE '%term%', case-insensitive — mirrors `company`; both have a trigram GIN index. */
  title?: string;
  limit?: number;
  offset?: number;
}

export interface ListVacanciesResult {
  items: VacancyListItem[];
  total: number;
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
