export interface SelectOption<T extends string> {
  value: T;
  label: string;
}

/** Native `<select>` wrapper. `className` picks the design's variant
 * (`filter-select` for toolbars, `status-select` for a table row). */
export function Select<T extends string>({
  id,
  value,
  options,
  disabled,
  className,
  onChange,
}: {
  id?: string;
  value: T;
  options: readonly SelectOption<T>[];
  disabled?: boolean;
  className?: string;
  onChange: (value: T) => void;
}) {
  return (
    <select
      id={id}
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value as T)}
      className={className}
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}
