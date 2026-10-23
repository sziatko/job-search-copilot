import type { ComponentType, SVGProps } from 'react';
import { CenterColumn } from './CenterColumn';

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
      <div className="flex size-13 items-center justify-center rounded-xl border border-accent-soft-border bg-accent-soft text-accent-ink">
        <Icon className="size-6" />
      </div>
      <h2>{title}</h2>
      <p>{description}</p>
      {items && (
        <div className="flex w-full flex-col gap-1.25 rounded-lg border border-border bg-surface-alt px-4 py-3 text-left text-sm text-ink-soft">
          {items.map((item) => (
            <div key={item}>· {item}</div>
          ))}
        </div>
      )}
    </CenterColumn>
  );
}
