import { EmptyState } from '@/components/ui/EmptyState';
import { Meta } from '@/components/ui/Meta';
import { TONE_FILL, type Tone } from '@/components/ui/tone';
import type { CommentSource, VacancyComment } from '@/lib/vacancies/types';
import { dateTimeFormatter } from './format';

/** Who wrote a comment, and its badge's tone. */
const SOURCE_META = {
  ANALYZER: { label: 'LLM analysis', tone: 'accent' },
  USER: { label: 'You', tone: 'neutral' },
  AGENT: { label: 'Agent', tone: 'warn' },
} satisfies Record<CommentSource, { label: string; tone: Tone }>;

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
            className="flex items-start gap-3 border-b border-border px-4 py-3 last:border-b-0"
          >
            <div
              className={`flex size-6.5 flex-none items-center justify-center rounded-full ${TONE_FILL[source.tone]}`}
              aria-hidden
            >
              {source.label[0]}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="text-small font-bold text-ink">{source.label}</span>
                <Meta as="time" dateTime={comment.createdAt} className="flex-none">
                  {dateTimeFormatter.format(new Date(comment.createdAt))}
                </Meta>
              </div>
              <div className="mt-1 whitespace-pre-line text-small leading-5 text-ink-soft">
                {comment.body}
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
