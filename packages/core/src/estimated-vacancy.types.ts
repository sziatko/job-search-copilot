import type { EstimatedVacancy, Recommendation, UserAction } from '@prisma/client';

export interface SaveEstimatedVacancyResult {
  /** false when a vacancy with this applyUrl already existed and was returned untouched. */
  created: boolean;
  vacancy: EstimatedVacancy;
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
};
