import { Meta } from '@/components/ui/Meta';

/** Each stage's colour, by row (`--color-funnel-1…5` in index.css). */
const BAR = ['bg-funnel-1', 'bg-funnel-2', 'bg-funnel-3', 'bg-funnel-4', 'bg-funnel-5'];

export interface FunnelStep {
  label: string;
  value: number;
}

/**
 * Five stages, each bar scaled against the first and each label against the one
 * above it. Each stage has its own colour (`BAR`).
 * Name · value · conversion, then the bar at the card's full width: on one line the
 * card (~330px at 1100 wide) left the bar nothing. When even the text line is too
 * wide, the conversion wraps under the name — never out of the card.
 */
export function Funnel({ steps }: { steps: FunnelStep[] }) {
  const baseline = steps[0]?.value ?? 0;

  return (
    <div className="flex flex-col gap-3 px-4 pt-2 pb-4">
      {steps.map((step, i) => {
        const previous = steps[i - 1];
        const width = baseline > 0 ? (step.value / baseline) * 100 : 0;
        const conversion = !previous
          ? 'baseline'
          : previous.value > 0
            ? `${Math.round((step.value / previous.value) * 100)}% of ${previous.label.toLowerCase()}`
            : '—';

        return (
          <div
            className="flex flex-wrap items-baseline gap-2"
            data-testid="funnel-row"
            key={step.label}
          >
            <div className="whitespace-nowrap text-small font-bold text-ink-soft">{step.label}</div>
            <div className="order-1 h-7 basis-full overflow-hidden rounded-sm bg-surface-sunken">
              <div
                className={`h-full min-w-[3%] rounded-sm ${BAR[i % BAR.length]}`}
                style={{ width: `${width}%` }}
              />
            </div>
            <div className="font-mono text-body font-semibold" data-testid="funnel-value">
              {step.value}
            </div>
            <Meta as="div" className="ml-auto whitespace-nowrap narrow:hidden">
              {conversion}
            </Meta>
          </div>
        );
      })}
    </div>
  );
}
