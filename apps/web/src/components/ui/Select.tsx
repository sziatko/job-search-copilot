import { useId } from 'react';

export interface SelectOption<T extends string> {
  value: T;
  label: string;
}

/** Native `<select>` wrapper, for a toolbar's filter and a row's status alike. Disabled
 * while its row saves. */
export function Select<T extends string>({
  id,
  label,
  value,
  options,
  disabled,
  onChange,
}: {
  id?: string;
  /** The accessible name, for a select with no `<label>` of its own. */
  label?: string;
  value: T;
  options: readonly SelectOption<T>[];
  disabled?: boolean;
  onChange: (value: T) => void;
}) {
  return (
    <select
      id={id}
      aria-label={label}
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value as T)}
      className="rounded-md border border-border-strong bg-surface px-2 py-2 text-small font-semibold text-ink disabled:cursor-wait disabled:opacity-50"
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

/** A toolbar's filter: its visible label beside the select. */
export function FilterSelect<T extends string>({
  label,
  ...props
}: {
  label: string;
  value: T;
  options: readonly SelectOption<T>[];
  onChange: (value: T) => void;
}) {
  const id = useId();
  return (
    <div className="flex items-center gap-2 text-small font-semibold text-ink-muted">
      <label htmlFor={id}>{label}</label>
      <Select id={id} {...props} />
    </div>
  );
}
