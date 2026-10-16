/**
 * A summary tile. The mockup draws these as inert <div>s; ours double as quick
 * filters, so they render as buttons when given an onClick and get a `.selected`
 * state the mockup has no equivalent for.
 */
export function KpiTile({
  label,
  value,
  note,
  variant,
  selected,
  onClick,
}: {
  label: string;
  value: number | string;
  note?: string;
  variant?: 'accent' | 'good' | 'warn' | 'bad';
  selected?: boolean;
  onClick?: () => void;
}) {
  const className = ['kpi-tile', variant, selected ? 'selected' : ''].filter(Boolean).join(' ');

  const body = (
    <>
      <div className="kpi-label">{label}</div>
      <div className="kpi-value" data-testid="kpi-value">
        {value}
      </div>
      {note && <div className="kpi-note">{note}</div>}
    </>
  );

  if (!onClick) {
    return (
      <div className={className} data-testid="kpi-tile">
        {body}
      </div>
    );
  }

  return (
    <button
      type="button"
      className={className}
      data-testid="kpi-tile"
      onClick={onClick}
      aria-pressed={!!selected}
      // Without this the name is the label and value run together ("Timeout1").
      aria-label={`${label}: ${value}`}
    >
      {body}
    </button>
  );
}
