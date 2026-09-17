import { useId } from 'react';
import { Select, type SelectOption } from '@/components/ui/Select';
import { APPLICATION_STATUS_LABELS, FILTER_LABELS } from '../constants';
import { type ApplicationStatusFilter, applicationStatusFilterValues } from '../types';

// Typed as the full filter union, so adding a filter value without a label here is a
// compile error rather than a blank row in the dropdown.
const LABELS: Record<ApplicationStatusFilter, string> = {
  ...APPLICATION_STATUS_LABELS,
  ...FILTER_LABELS,
};

const OPTIONS: SelectOption<ApplicationStatusFilter>[] = applicationStatusFilterValues.map(
  (value) => ({ value, label: LABELS[value] }),
);

export function ApplicationStatusFilterSelect({
  value,
  onChange,
}: {
  value: ApplicationStatusFilter;
  onChange: (value: ApplicationStatusFilter) => void;
}) {
  const id = useId();
  return (
    <label htmlFor={id} className="flex items-center gap-2 text-sm text-slate-600">
      Status
      <Select id={id} value={value} options={OPTIONS} onChange={onChange} />
    </label>
  );
}
