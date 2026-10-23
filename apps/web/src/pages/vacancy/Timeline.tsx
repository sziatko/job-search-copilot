import { IconCheck, IconCross } from '@/components/icons';
import { STATUS_LABELS } from '@/lib/vacancies/constants';
import type { VacancyDetail, VacancyStatus } from '@/lib/vacancies/types';
import { dateFormatter } from './format';

/** The statuses that end a vacancy: a bad one, and the good one. */
const CLOSED_BAD: readonly VacancyStatus[] = [
  'DECLINED',
  'UNAVAILABLE',
  'FILTERED_OUT',
  'REJECTED',
];
const CLOSED_GOOD: VacancyStatus = 'OFFER';

/** A step's dot and label: done (passed through), current (open, here now), or the
 * closing bad / good one. */
const NODE = {
  done: {
    dot: 'border-border-strong bg-surface-sunken text-ink-muted',
    label: 'font-semibold text-ink-muted',
  },
  current: {
    dot: 'border-accent bg-accent-soft text-accent-ink ring-3 ring-accent-soft',
    label: 'font-bold text-ink',
  },
  bad: { dot: 'border-bad bg-bad-soft text-bad', label: 'font-bold text-ink' },
  good: { dot: 'border-good bg-good-soft text-good', label: 'font-bold text-ink' },
};

/** The line into a step; `trailing` runs off the last one while the vacancy is open. */
const CONNECTOR = {
  plain: 'bg-border-strong',
  bad: 'bg-[repeating-linear-gradient(90deg,var(--color-bad),var(--color-bad)_4px,transparent_4px,transparent_8px)]',
  good: 'bg-good',
  trailing:
    'max-w-10 bg-[repeating-linear-gradient(90deg,var(--color-border-strong),var(--color-border-strong)_4px,transparent_4px,transparent_8px)]',
};

/** Fixed, not flex-1: a short timeline stays compact at the left edge, and a long one
 * lays its steps out evenly (the card scrolls sideways). */
function Connector({ kind }: { kind: keyof typeof CONNECTOR }) {
  return <div className={`-mx-0.5 mb-5 h-0.5 w-16 ${CONNECTOR[kind]}`} />;
}

/** Every `StatusChange`, oldest first. The last step is where the vacancy is now:
 * marked bad or good when it is closed, and trailing off when it is still open. */
export function Timeline({ steps }: { steps: VacancyDetail['timeline'] }) {
  const last = steps.at(-1)?.status;
  const open = last !== undefined && !CLOSED_BAD.includes(last) && last !== CLOSED_GOOD;

  return (
    <div className="flex items-center overflow-x-auto px-4.5 py-4">
      {steps.map((step, i) => {
        const bad = CLOSED_BAD.includes(step.status);
        const good = step.status === CLOSED_GOOD;
        const isLast = i === steps.length - 1;
        const node = NODE[!isLast ? 'done' : bad ? 'bad' : good ? 'good' : 'current'];
        return (
          // The journal is append-only, and two moves never share a date and a status.
          <div key={`${step.createdAt}-${step.status}`} className="contents">
            {i > 0 && <Connector kind={bad ? 'bad' : good ? 'good' : 'plain'} />}
            <div className="flex w-27 flex-none flex-col items-center gap-1.5 text-center">
              <div
                className={`flex size-6.5 flex-none items-center justify-center rounded-full border-2 text-xs font-bold [&_svg]:size-3 ${node.dot}`}
              >
                {isLast && bad && <IconCross />}
                {isLast && good && <IconCheck />}
              </div>
              <div className={`text-xs ${node.label}`} data-testid="timeline-status">
                {STATUS_LABELS[step.status]}
              </div>
              <time className="font-mono text-2xs tabular-nums text-ink-faint">
                {dateFormatter.format(new Date(step.createdAt))}
              </time>
            </div>
          </div>
        );
      })}
      {open && <Connector kind="trailing" />}
    </div>
  );
}
