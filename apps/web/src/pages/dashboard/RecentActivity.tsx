import { Link } from '@tanstack/react-router';
import { EmptyState } from '@/components/ui/EmptyState';
import { APPLICATION_STATUS_LABELS } from '@/lib/applications/constants';
import type { ApplicationStatus } from '@/lib/applications/types';
import type { RecentMove } from '@/lib/stats/types';
import { timeAgo } from '@/lib/timeAgo';

/** What each status change reads as in the feed, and its dot colour. */
const ACTIVITY: Record<ApplicationStatus, { verb: string; dot: string }> = {
  APPLIED: { verb: 'Applied', dot: 'bg-accent' },
  ACTION_NEEDED: { verb: 'Action needed', dot: 'bg-good' },
  INTERVIEW: { verb: 'Interview scheduled', dot: 'bg-good' },
  AWAITING: { verb: 'Awaiting their reply', dot: 'bg-accent' },
  OFFER: { verb: 'Offer received', dot: 'bg-good' },
  REJECTED: { verb: 'Rejected', dot: 'bg-warn' },
};

/** The latest pipeline moves, newest first. */
export function RecentActivity({ items }: { items: RecentMove[] }) {
  if (items.length === 0) {
    return <EmptyState>No status changes yet.</EmptyState>;
  }

  return (
    <ul className="flex flex-col" aria-label="Recent activity">
      {items.map((item) => (
        <li
          className="flex items-center gap-2.75 border-b border-border px-4.5 py-2.75 last:border-b-0"
          key={item.id}
        >
          <div className={`size-2 flex-none rounded-full ${ACTIVITY[item.status].dot}`} />
          <div className="min-w-0 flex-1">
            <div className="truncate text-base font-bold">
              {ACTIVITY[item.status].verb} — {item.company}
            </div>
            <div className="mt-px text-xs text-ink-muted">
              <Link
                to="/vacancies/$id"
                params={{ id: String(item.vacancyId) }}
                className="text-ink no-underline hover:text-accent-ink hover:underline"
              >
                {item.title}
              </Link>{' '}
              · {APPLICATION_STATUS_LABELS[item.status]}
            </div>
          </div>
          <div className="flex-none font-mono text-xs text-ink-faint">
            {timeAgo(item.createdAt)}
          </div>
        </li>
      ))}
    </ul>
  );
}
