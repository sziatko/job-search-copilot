import { Link } from '@tanstack/react-router';
import { EmptyState } from '@/components/ui/EmptyState';
import { TONE } from '@/components/ui/tone';
import type { VacancyListItem } from '@/lib/vacancies/types';

/** The top of the triage queue, each row a way to its vacancy page. */
export function ReviewQueue({ items }: { items: VacancyListItem[] }) {
  if (items.length === 0) {
    return <EmptyState>Everything is triaged. Nice.</EmptyState>;
  }

  return (
    <ul className="flex flex-col" aria-label="Needs your review">
      {items.map((item) => (
        <li
          className="flex items-center gap-3 border-b border-border px-4 py-3 last:border-b-0"
          key={item.id}
        >
          <div
            className={`min-w-10 flex-none rounded-md border px-2 py-1 text-center font-mono text-small font-bold ${TONE.good}`}
          >
            {item.matchScore === null ? '—' : `${item.matchScore}%`}
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-body font-bold">{item.title}</div>
            <div className="mt-px text-caption text-ink-muted">{item.company}</div>
          </div>
          <Link
            to="/vacancies/$id"
            params={{ id: String(item.id) }}
            className={`flex-none cursor-pointer rounded-sm border px-2 py-1 text-caption font-bold ${TONE.accent}`}
            // Ten links read "Review" otherwise.
            aria-label={`Review ${item.title}`}
          >
            Review
          </Link>
        </li>
      ))}
    </ul>
  );
}
