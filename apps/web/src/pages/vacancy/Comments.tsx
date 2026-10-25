import { EmptyState } from '@/components/ui/EmptyState';
import type { CommentSource, VacancyComment } from '@/lib/vacancies/types';
import { dateTimeFormatter } from './format';

/** Who wrote a comment, and its badge's colours. */
const SOURCE_META = {
  ANALYZER: { label: 'LLM analysis', badge: 'bg-accent-soft text-accent-ink' },
  USER: { label: 'You', badge: 'bg-surface-sunken text-ink-muted' },
  AGENT: { label: 'Agent', badge: 'bg-warn-soft text-warn' },
} satisfies Record<CommentSource, { label: string; badge: string }>;

/** Every comment, oldest first, each with its source's badge and its time. */
export function Comments({ comments }: { comments: VacancyComment[] }) {
  if (comments.length === 0) {
    return <EmptyState>No comments yet</EmptyState>;
  }
  return (
    <ul className="flex flex-col" aria-label="Comments">
      {comments.map((comment) => {
        const source = SOURCE_META[comment.source];
        return (
          <li
            key={comment.id}
            className="flex items-start gap-2.75 border-b border-border px-4.5 py-3.25 last:border-b-0"
          >
            <div
              className={`flex size-6.5 flex-none items-center justify-center rounded-full ${source.badge}`}
              aria-hidden
            >
              {source.label[0]}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="text-sm font-bold text-ink">{source.label}</span>
                <time className="flex-none font-mono text-xs text-ink-faint">
                  {dateTimeFormatter.format(new Date(comment.createdAt))}
                </time>
              </div>
              <div className="mt-0.75 whitespace-pre-line text-sm leading-4.75 text-ink-soft">
                {comment.body}
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
