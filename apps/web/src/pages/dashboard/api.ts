import { listEstimatedVacanciesPage } from '../vacancies/api';
import { type EstimatedVacancyListItem, RECOMMENDATION, USER_ACTION } from '../vacancies/types';

export interface DashboardCounts {
  /** Every `EstimatedVacancy` row — analysed *and* imported. Named for what it
   * counts, not for what the old tile called it: an importer placeholder is in
   * here too (phase 2.2, finding 11). */
  postings: number;
  awaitingTriage: number;
  recommended: number;
  reviewQueue: EstimatedVacancyListItem[];
}

/**
 * Everything the dashboard needs from the vacancy side, in one cached query.
 *
 * There is no stats endpoint, and none is needed: a list response's `total` is
 * the count matching the filter rather than the page size, so `limit=1` behaves
 * as a count endpoint. Four small requests, run in parallel.
 *
 * The triage request doubles as the review queue — `total` gives the exact
 * count, `items` gives the rows to rank client-side.
 */
export async function fetchDashboardCounts(): Promise<DashboardCounts> {
  const [all, triage, apply, caveats] = await Promise.all([
    listEstimatedVacanciesPage({ limit: 1 }),
    listEstimatedVacanciesPage({ userAction: USER_ACTION.NOT_REVIEWED, limit: 100 }),
    listEstimatedVacanciesPage({ recommendation: RECOMMENDATION.APPLY, limit: 1 }),
    listEstimatedVacanciesPage({ recommendation: RECOMMENDATION.APPLY_WITH_CAVEATS, limit: 1 }),
  ]);

  return {
    postings: all.total,
    awaitingTriage: triage.total,
    recommended: apply.total + caveats.total,
    reviewQueue: triage.items,
  };
}
