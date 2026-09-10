import { useId } from 'react';
import { Select, type SelectOption } from '@/components/ui/Select';
import { USER_ACTION_LABELS } from '../constants';
import { STATUS_FILTER_ALL, type StatusFilterValue, statusFilterValues } from '../types';

const LABELS: Record<StatusFilterValue, string> = {
  ...USER_ACTION_LABELS,
  [STATUS_FILTER_ALL]: 'All',
};

const OPTIONS: SelectOption<StatusFilterValue>[] = statusFilterValues.map((value) => ({
  value,
  label: LABELS[value],
}));

export function StatusFilterSelect({
  value,
  onChange,
}: {
  value: StatusFilterValue;
  onChange: (value: StatusFilterValue) => void;
}) {
  const id = useId();
  return (
    <label htmlFor={id} className="flex items-center gap-2 text-sm text-slate-600">
      Status
      <Select id={id} value={value} options={OPTIONS} onChange={onChange} />
    </label>
  );
}
