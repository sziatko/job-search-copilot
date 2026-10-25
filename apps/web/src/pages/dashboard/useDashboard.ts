import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/lib/queryKeys';
import { fetchStats } from '@/lib/stats/api';
import { listVacanciesPage } from '@/lib/vacancies/api';
import { VACANCY_ACTION } from '@/lib/vacancies/types';

/** Enough to fill the funnel card's height on a desktop; the rest scrolls in the card. */
const REVIEW_QUEUE_SIZE = 10;

/** Two requests: the numbers, and the top of the triage queue in the server's order. */
export function useDashboard() {
  const stats = useQuery({ queryKey: queryKeys.stats(), queryFn: fetchStats });
  const reviewQueue = useQuery({
    queryKey: queryKeys.dashboard('review-queue'),
    queryFn: () =>
      listVacanciesPage({
        status: [VACANCY_ACTION.NOT_REVIEWED],
        sort: 'recommended',
        limit: REVIEW_QUEUE_SIZE,
      }),
  });

  const error = stats.error ?? reviewQueue.error;
  const applied = stats.data?.applied ?? 0;
  const responded = stats.data?.responded ?? 0;

  return {
    loading: stats.isPending || reviewQueue.isPending,
    loadError: error ? (error instanceof Error ? error.message : String(error)) : null,
    stats: stats.data,
    /** Of the applied, the share that ever got a response; 0, not NaN, before the first. */
    responseRate: applied > 0 ? Math.round((responded / applied) * 1000) / 10 : 0,
    reviewQueue: reviewQueue.data?.items ?? [],
  };
}
