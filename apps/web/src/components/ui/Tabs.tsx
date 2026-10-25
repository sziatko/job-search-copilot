import type { SelectOption } from './Select';

const TAB = 'cursor-pointer rounded-sm border px-3 py-1.25 text-sm font-semibold';
const PRESSED = `${TAB} border-accent-soft-border bg-accent-soft text-accent-ink`;
const IDLE = `${TAB} border-transparent bg-transparent text-ink-muted hover:text-ink`;

/** A segmented control: which of a few views of a list is shown, the pressed one tinted
 * like the active nav item. A named group of toggle buttons (`aria-pressed`). */
export function Tabs<T extends string>({
  legend,
  options,
  value,
  onChange,
}: {
  /** The group's name, for a screen reader. */
  legend: string;
  options: readonly SelectOption<T>[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <fieldset className="flex flex-wrap gap-0.75 rounded-lg border border-border bg-surface-sunken p-0.75">
      <legend className="sr-only">{legend}</legend>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          className={option.value === value ? PRESSED : IDLE}
          aria-pressed={option.value === value}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </fieldset>
  );
}
