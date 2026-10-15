import type { CommentSource, Recommendation, Vacancy, VacancyStatus } from '@prisma/client';

export interface VacancyComment {
  id: number;
  createdAt: Date;
  body: string;
  source: CommentSource;
}

export interface SaveVacancyResult {
  /** true when this call created the row. */
  created: boolean;
  /** true when the row existed unanalysed (taken in by intake) and this call's analysis
   * was attached to it. Both false = the row already had an analysis and was returned
   * untouched, this one dropped. */
  attached: boolean;
  vacancy: Vacancy;
}

/** An analysis for a vacancy that exists, written once (ADR-0033). */
export interface SubmitAnalysisInput {
  id: number;
  matchScore: number;
  /** `APPLY` | `APPLY_WITH_CAVEATS` | `SKIP`, exact — checked by `parseRecommendation`. */
  recommendation: string;
  /** Written as the vacancy's `ANALYZER` comment; a blank one writes none. */
  estimationComment: string;
}

/** Max analyses per submitAnalyses / get_vacancies_batch call: each posting is read and
 * scored by an agent, and ten keeps one step's context small. Enforced by the
 * transports. */
export const ANALYSIS_BATCH_MAX = 10;

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
  /** `APPLY` | `APPLY_WITH_CAVEATS` | `SKIP`, exact — checked by `parseRecommendation`. */
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
  /** Every vacancy of this name's company, whatever its spelling (`companyGroupKey`,
   * ADR-0032) — the company modal and the vacancy page's other vacancies. */
  sameCompanyAs?: string;
  /** Exact, after the same normalization `save` applies — see `applyUrlKey`. */
  applyUrl?: string;
  /** ILIKE '%term%', case-insensitive — mirrors `company`; both have a trigram GIN index. */
  title?: string;
  /** true: only rows with posting text; false: only rows without. */
  hasText?: boolean;
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
 * APPLY_WITH_CAVEATS, SKIP — then the unanalysed), `matchScore desc, id desc` — the
 * web's triage order. */
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
  /** Both null when the vacancy has no analysis yet. */
  matchScore: number | null;
  recommendation: Recommendation | null;
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
   * Whether the vacancy has an analysis: `recommendation !== null` (ADR-0033). Derived
   * the same way, and absent from the single-record endpoints for the same reason.
   */
  hasAnalysis: boolean;
  /** Whether the vacancy has posting text (`fullText !== null`) — derived the same way;
   * the single-record endpoints carry `fullText` itself. */
  hasText: boolean;
};
