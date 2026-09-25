import type { EstimatedVacancy, Recommendation, UserAction } from '@prisma/client';

export interface SaveEstimatedVacancyResult {
  /** false when a vacancy with this applyUrl already existed and was returned untouched. */
  created: boolean;
  vacancy: EstimatedVacancy;
}

export interface SaveManyEstimatedVacanciesResult {
  results: SaveEstimatedVacancyResult[];
}

export interface SaveEstimatedVacancyInput {
  company: string;
  title: string;
  applyUrl: string;
  fullText: string;
  matchScore: number;
  /** Accepts the canonical English value or its Ukrainian equivalent — see recommendation.ts. */
  recommendation: string;
  estimationComment: string;
}

export interface ListEstimatedVacanciesFilters {
  recommendation?: Recommendation;
  userAction?: UserAction;
  /** Matches company OR title, ILIKE '%term%', case-insensitive. For the /vacancies
   * page's single free-text search box. Independent of `company`/`title` — combined
   * with them via AND, not OR. */
  search?: string;
  /** ILIKE '%term%', case-insensitive. */
  company?: string;
  /** ILIKE '%term%', case-insensitive — mirrors `company`; both have a trigram GIN index. */
  title?: string;
  limit?: number;
  offset?: number;
}

export interface ListEstimatedVacanciesResult {
  items: EstimatedVacancyListItem[];
  total: number;
}

/** Lightweight shape for list/search results — omits fullText to keep responses small. */
export type EstimatedVacancyListItem = {
  id: number;
  createdAt: Date;
  updatedAt: Date;
  company: string;
  title: string;
  applyUrl: string;
  matchScore: number;
  recommendation: Recommendation;
  estimationComment: string;
  userAction: UserAction;
  userActionUpdatedAt: Date | null;
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
   * The test is the placeholder sentinel `estimationComment: 'N/A'` that
   * `ApplicationService.resolveVacancyId` writes for a row the *importer* created
   * (ADR-0019) — there is no column for this, and inventing one would mean the
   * analyzer and the importer both had to maintain it. Ceiling, named where it is
   * derived: an analysis commented exactly `N/A` reads as unanalysed, and a
   * placeholder carrying real tracker notes reads as analysed. Consumers show a
   * dash rather than a claim, so the failure is a missing number, never a
   * fabricated one.
   */
  hasAnalysis: boolean;
};
