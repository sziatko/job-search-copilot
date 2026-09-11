import type { ApplicationStatus, Recommendation } from '@prisma/client';

/**
 * WEB path: the analyzed vacancy row already exists and the caller knows its id
 * (the /vacancies page marking a row APPLIED). Link directly, no lookup.
 */
export interface RecordApplicationByIdInput {
  estimatedVacancyId: number;
  salaryInListing?: string | null;
  usedTailoredResume?: boolean;
  userComment?: string | null;
  /** Defaults to APPLIED. */
  status?: ApplicationStatus;
  /** Defaults to now(). The tracker import passes historical dates. */
  appliedAt?: Date;
}

/**
 * MCP / import path: the vacancy is identified by (company, title). A unique match
 * links to it; no match creates a minimal EstimatedVacancy with placeholder analyzer
 * fields (see ApplicationService.record / ADR-0019); more than one match is an error.
 */
export interface RecordApplicationByVacancyInput {
  company: string;
  title: string;
  /** Synthesized as `tracker://…` when absent. */
  applyUrl?: string | null;
  /** For a created vacancy: from the tracker text, else 0. */
  matchScore?: number | null;
  /** For a created vacancy: explicit, else derived from matchScore, else 'APPLY'. */
  recommendation?: Recommendation | null;
  /** For a created vacancy: else 'N/A'. */
  fullText?: string | null;
  /** For a created vacancy: from the tracker notes, else 'N/A'. */
  estimationComment?: string | null;
  salaryInListing?: string | null;
  usedTailoredResume?: boolean;
  userComment?: string | null;
  status?: ApplicationStatus;
  appliedAt?: Date;
}

export type RecordApplicationInput = RecordApplicationByIdInput | RecordApplicationByVacancyInput;

export function isById(input: RecordApplicationInput): input is RecordApplicationByIdInput {
  return 'estimatedVacancyId' in input && typeof input.estimatedVacancyId === 'number';
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

export interface ListApplicationsFilters {
  status?: ApplicationStatus;
  /** Matches EstimatedVacancy.company OR .title, ILIKE '%term%', case-insensitive. */
  search?: string;
  /** Default 50, max 500. */
  limit?: number;
  offset?: number;
}

export interface ListApplicationsResult {
  items: ApplicationListItem[];
  total: number;
}

/**
 * A flattened Application ⋈ EstimatedVacancy row: the Application's own delta plus
 * the vacancy fields the /tracker page renders. The vacancy fields are never NULL —
 * a never-analyzed application still has a real (placeholder-filled) vacancy row.
 */
export interface ApplicationListItem {
  id: number;
  appliedAt: Date;
  status: ApplicationStatus;
  statusUpdatedAt: Date | null;
  /** Accumulated pipeline notes — see ApplicationService.updateStatus. */
  statusComment: string | null;
  salaryInListing: string | null;
  usedTailoredResume: boolean;
  userComment: string | null;
  createdAt: Date;
  updatedAt: Date;
  estimatedVacancyId: number;
  company: string;
  title: string;
  applyUrl: string;
  matchScore: number;
  recommendation: Recommendation;
  estimationComment: string;
}
