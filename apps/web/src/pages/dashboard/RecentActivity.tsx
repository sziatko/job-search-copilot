import { Link } from '@tanstack/react-router';
import { EmptyState } from '@/components/ui/EmptyState';
import { Meta } from '@/components/ui/Meta';
import { TONE_DOT } from '@/components/ui/tone';
import { APPLICATION_STATUS_LABELS } from '@/lib/applications/constants';
import type { ApplicationStatus } from '@/lib/applications/types';
import type { RecentMove } from '@/lib/stats/types';
import { timeAgo } from '@/lib/timeAgo';
import { STATUS_TAGS } from '@/lib/vacancies/constants';

/** What each status change reads as in the feed; its dot is its status tag's tone. */
const VERB: Record<ApplicationStatus, string> = {
  APPLIED: 'Applied',
  ACTION_NEEDED: 'Action needed',
  INTERVIEW: 'Interview scheduled',
  AWAITING: 'Awaiting their reply',
  OFFER: 'Offer received',
  REJECTED: 'Rejected',
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
          className="flex items-center gap-3 border-b border-border px-4 py-3 last:border-b-0"
          key={item.id}
        >
          <div
            className={`size-2 flex-none rounded-full ${TONE_DOT[STATUS_TAGS[item.status].tone]}`}
          />
          <div className="min-w-0 flex-1">
            <div className="truncate text-body font-bold">
              {VERB[item.status]} — {item.company}
            </div>
            <div className="mt-px text-caption text-ink-muted">
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
          <Meta as="div" className="flex-none">
            {timeAgo(item.createdAt)}
          </Meta>
        </li>
      ))}
    </ul>
  );
}
