import { useId } from 'react';
import { Select, type SelectOption } from '@/components/ui/Select';
import type { StatusFilterValue } from '../types';

const OPTIONS: SelectOption<StatusFilterValue>[] = [
  { value: 'NOT_REVIEWED', label: 'Not reviewed' },
  { value: 'READY_TO_APPLY', label: 'Ready to apply' },
  { value: 'APPLIED', label: 'Applied' },
  { value: 'DECLINED', label: 'Declined' },
  { value: 'ALL', label: 'All' },
];

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
