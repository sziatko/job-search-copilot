import { Link } from '@tanstack/react-router';
import { EmptyState } from '@/components/ui/EmptyState';
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
          className="flex items-center gap-2.75 border-b border-border px-4.5 py-2.75 last:border-b-0"
          key={item.id}
        >
          <div className="min-w-10 flex-none rounded-md border border-good-soft-border bg-good-soft px-1.75 py-1.25 text-center font-mono text-sm font-bold text-good">
            {item.matchScore === null ? '—' : `${item.matchScore}%`}
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-base font-bold">{item.title}</div>
            <div className="mt-px text-xs text-ink-muted">{item.company}</div>
          </div>
          <Link
            to="/vacancies/$id"
            params={{ id: String(item.id) }}
            className="flex-none cursor-pointer rounded-sm border border-accent-soft-border bg-accent-soft px-2.25 py-1.25 text-xs font-bold text-accent"
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
