import type { Recommendation, VacancyStatus } from '@prisma/client';
import type { PipelineStatus } from './status';
import type { VacancyComment } from './vacancy.types';

/**
 * WEB path: the analyzed vacancy row already exists and the caller knows its id
 * (the /vacancies page applying to a row). Link directly, no lookup.
 */
export interface RecordApplicationByIdInput {
  vacancyId: number;
  salaryInListing?: string | null;
  usedTailoredResume?: boolean;
  /** Added as a USER comment; a blank one adds none. */
  comment?: string | null;
  /** Where the application already is. APPLIED is journaled first either way. */
  status?: PipelineStatus;
}

/**
 * MCP path: the vacancy is identified by (company, title). A unique match links to it;
 * no match creates a minimal Vacancy with placeholder analyzer fields (see
 * ApplicationService.record / ADR-0019); more than one match is an error.
 */
export interface RecordApplicationByVacancyInput {
  company: string;
  title: string;
  /** Synthesized as `tracker://…` when absent. */
  applyUrl?: string | null;
  /** For a created vacancy: else 0. */
  matchScore?: number | null;
  /** For a created vacancy: explicit, else derived from matchScore, else 'APPLY'. */
  recommendation?: Recommendation | null;
  /** For a created vacancy: else PLACEHOLDER_COMMENT ('N/A'). */
  fullText?: string | null;
  /** For a created vacancy: its ANALYZER comment, else none. */
  estimationComment?: string | null;
  salaryInListing?: string | null;
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
  salaryInListing?: string | null;
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
  /** Exact, after the same normalization `save` applies — see `applyUrlKey`. */
  applyUrl?: string;
  /** Default 50, max 500. */
  limit?: number;
  offset?: number;
}

export interface ListApplicationsResult {
  items: ApplicationListItem[];
  total: number;
}

/**
 * A vacancy seen from /applications: the fields that page renders. `id` is the
 * vacancy's. The analyzer fields are never NULL — a never-analyzed application still
 * has a real (placeholder-filled) vacancy row.
 */
export interface ApplicationListItem {
  id: number;
  /** A pipeline status on every list / getById row. A status write returns the row
   * whatever it moved to, triage included. */
  status: VacancyStatus;
  statusChangedAt: Date;
  /** The latest APPLIED journal row's date; null when the vacancy reached the pipeline
   * without one (a status set straight past APPLIED). */
  appliedAt: Date | null;
  /** Every comment on the vacancy, oldest first, the analyzer's included. */
  comments: VacancyComment[];
  salaryInListing: string | null;
  usedTailoredResume: boolean;
  company: string;
  title: string;
  applyUrl: string;
  matchScore: number;
  recommendation: Recommendation;
}
