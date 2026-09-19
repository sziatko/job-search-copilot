import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { listApplications } from '../applications/api';
import type { ApplicationStatus } from '../applications/types';
import { fetchDashboardCounts } from './api';

/** Past a reply, the pipeline has heard back — a recruiter screen counts. */
const RESPONDED: ReadonlySet<ApplicationStatus> = new Set([
  'REPLIED',
  'RECRUITER_SCREEN',
  'INTERVIEW',
  'OFFER',
]);

const IN_INTERVIEW: ReadonlySet<ApplicationStatus> = new Set(['INTERVIEW', 'OFFER']);

const REVIEW_QUEUE_SIZE = 5;
const ACTIVITY_SIZE = 6;

export function useDashboard() {
  // Same key and fetcher the tracker uses, so navigating between the two reuses
  // one request and one optimistic cache.
  const applications = useQuery({ queryKey: ['applications'], queryFn: listApplications });
  const counts = useQuery({ queryKey: ['dashboard', 'counts'], queryFn: fetchDashboardCounts });

  const apps = useMemo(() => applications.data?.items ?? [], [applications.data]);

  const metrics = useMemo(() => {
    let responded = 0;
    let interview = 0;
    let recruiterScreen = 0;
    for (const app of apps) {
      if (RESPONDED.has(app.status)) responded += 1;
      if (IN_INTERVIEW.has(app.status)) interview += 1;
      if (app.status === 'RECRUITER_SCREEN') recruiterScreen += 1;
    }
    const sent = applications.data?.total ?? apps.length;
    return {
      sent,
      responded,
      interview,
      recruiterScreen,
      responseRate: sent > 0 ? Math.round((responded / sent) * 1000) / 10 : 0,
    };
  }, [apps, applications.data]);

  // Scoring happens out of order, so the ranking is done here rather than asked
  // of the API — it has no sort parameter.
  const reviewQueue = useMemo(
    () =>
      [...(counts.data?.reviewQueue ?? [])]
        .sort((a, b) => b.matchScore - a.matchScore)
        .slice(0, REVIEW_QUEUE_SIZE),
    [counts.data],
  );

  const recentActivity = useMemo(
    () =>
      [...apps]
        .sort(
          (a, b) => new Date(b.statusUpdatedAt).getTime() - new Date(a.statusUpdatedAt).getTime(),
        )
        .slice(0, ACTIVITY_SIZE),
    [apps],
  );

  const error = counts.error ?? applications.error;

  return {
    loading: counts.isPending || applications.isPending,
    loadError: error ? (error instanceof Error ? error.message : String(error)) : null,
    counts: counts.data,
    metrics,
    reviewQueue,
    recentActivity,
  };
}
