import type { Recommendation, VacancyStatus } from '@prisma/client';
import type { PipelineStatus } from '../domain/status';
import type { VacancyComment } from '../vacancies/vacancy.types';

/**
 * WEB path: the analyzed vacancy row already exists and the caller knows its id
 * (the /vacancies page applying to a row). Link directly, no lookup.
 */
export interface RecordApplicationByIdInput {
  vacancyId: number;
  salaryInApplication?: string | null;
  usedTailoredResume?: boolean;
  /** Added as a USER comment; a blank one adds none. */
  comment?: string | null;
  /** Where the application already is. APPLIED is journaled first either way. */
  status?: PipelineStatus;
}

/**
 * MCP path: the vacancy is identified by (company, title). A unique match links to it;
 * no match creates a minimal Vacancy without an analysis — only the analyzer writes one
 * (see ApplicationService.record / ADR-0019); more than one match is an error.
 */
export interface RecordApplicationByVacancyInput {
  company: string;
  title: string;
  /** Synthesized as `tracker://…` when absent. */
  applyUrl?: string | null;
  salaryInApplication?: string | null;
  usedTailoredResume?: boolean;
  /** Added as a USER comment; a blank one adds none. */
  comment?: string | null;
  status?: PipelineStatus;
}

export type RecordApplicationInput = RecordApplicationByIdInput | RecordApplicationByVacancyInput;

export function isById(input: RecordApplicationInput): input is RecordApplicationByIdInput {
  return 'vacancyId' in input && typeof input.vacancyId === 'number';
}

export type VacancyResolution = 'linked-by-id' | 'linked-existing' | 'created-vacancy';

export interface RecordApplicationResult {
  application: ApplicationListItem;
  resolution: VacancyResolution;
  vacancyCreated: boolean;
}

export interface RecordManyApplicationsResult {
  results: RecordApplicationResult[];
}

/** ApplicationService.update: the fields the apply modal wrote. Absent = untouched;
 * null or blank = cleared. `comment` is not a field: a non-blank one adds a USER
 * comment, a blank one adds nothing. */
export interface UpdateApplicationInput {
  salaryInApplication?: string | null;
  usedTailoredResume?: boolean;
  comment?: string | null;
}

export interface ListApplicationsFilters {
  /** One pipeline status; absent = all of them. */
  status?: PipelineStatus;
  /** Matches Vacancy.company OR .title, ILIKE '%term%', case-insensitive. For
   * the /applications page's single free-text search box. */
  search?: string;
  /** Matches Vacancy.company, ILIKE '%term%', case-insensitive. Independent of
   * `search` — combined with `title` (and `search`, if also given) via AND, not OR. */
  company?: string;
  /** Matches Vacancy.title, ILIKE '%term%', case-insensitive. See `company`. */
  title?: string;
  /** Every application at this name's company, whatever its spelling (`companyGroupKey`,
   * ADR-0032). ANDs with the rest. */
  sameCompanyAs?: string;
  /** Exact, after the same normalization `save` applies — see `applyUrlKey`. */
  applyUrl?: string;
  /** The derived split (ADR-0031): `active` or `timedOut`; absent = both, and the
   * closed statuses too. ANDs with `status`. */
  state?: ApplicationState;
  /** Default 50, max 500. */
  limit?: number;
  /** MCP's paging. Not with `cursor` — REST answers both with a 400. */
  offset?: number;
  /** The web's paging (ADR-0030): the `id` of the last row the caller has. */
  cursor?: number;
}

/** `/applications`' Active / Timeout filter — the timeout rule in `status.ts`. */
export const APPLICATION_STATES = ['active', 'timedOut'] as const;
export type ApplicationState = (typeof APPLICATION_STATES)[number];

/** A list row: the item plus the derived duplicates count — the same company by an
 * equal `companyGroupKey`, as on /vacancies (ADR-0032). Only `list` derives it; the
 * single-row reads and writes do not. */
export interface ApplicationListRow extends ApplicationListItem {
  companyMatchCount: number;
}

export interface ListApplicationsResult {
  items: ApplicationListRow[];
  /** Rows matching the filter, not the page size. */
  total: number;
  /** The last item's `id` when more rows follow, else null. */
  nextCursor: number | null;
}

/**
 * A vacancy seen from /applications: the fields that page renders. `id` is the
 * vacancy's.
 */
export interface ApplicationListItem {
  id: number;
  /** A pipeline status on every list / getById row. A status write returns the row
   * whatever it moved to, triage included. */
  status: VacancyStatus;
  statusChangedAt: Date;
  /** The timeout rule (ADR-0031), as of the read: open and not moved for
   * TIMEOUT_DAYS. */
  timedOut: boolean;
  /** The latest APPLIED journal row's date; null when the vacancy reached the pipeline
   * without one (a status set straight past APPLIED). */
  appliedAt: Date | null;
  /** Every comment on the vacancy, oldest first, the analyzer's included. */
  comments: VacancyComment[];
  salaryInApplication: string | null;
  usedTailoredResume: boolean;
  company: string;
  title: string;
  applyUrl: string;
  /** Both null when the vacancy has no analysis (a vacancy record_application created). */
  matchScore: number | null;
  recommendation: Recommendation | null;
}
