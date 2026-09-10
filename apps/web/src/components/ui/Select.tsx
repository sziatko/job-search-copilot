export interface SelectOption<T extends string> {
  value: T;
  label: string;
}

export function Select<T extends string>({
  id,
  value,
  options,
  disabled,
  onChange,
}: {
  id?: string;
  value: T;
  options: readonly SelectOption<T>[];
  disabled?: boolean;
  onChange: (value: T) => void;
}) {
  return (
    <select
      id={id}
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value as T)}
      className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-700 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}
