import type { ComponentType, SVGProps } from 'react';
import { CenterColumn } from './CenterColumn';
import { TONE } from './tone';

/** What a feature with no backend behind it yet will be: its icon, a line, a list. */
export function ComingSoon({
  icon: Icon,
  title,
  description,
  items,
}: {
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  title: string;
  description: string;
  items?: string[];
}) {
  return (
    <CenterColumn>
      <div className={`flex size-13 items-center justify-center rounded-xl border ${TONE.accent}`}>
        <Icon className="size-6" />
      </div>
      <h2>{title}</h2>
      <p>{description}</p>
      {items && (
        <div className="flex w-full flex-col gap-1 rounded-lg border border-border bg-surface-alt px-4 py-3 text-left text-small text-ink-soft">
          {items.map((item) => (
            <div key={item}>· {item}</div>
          ))}
        </div>
      )}
    </CenterColumn>
  );
}
