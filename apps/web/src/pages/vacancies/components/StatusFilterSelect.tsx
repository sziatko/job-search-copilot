import { FilterSelect, type SelectOption } from '@/components/ui/Select';
import { STATUS_LABELS } from '../constants';
import { STATUS_FILTER_ALL, type StatusFilterValue, statusFilterValues } from '../types';

// The page's own statuses (its context); the pipeline is /applications'.
const LABELS: Record<StatusFilterValue, string> = {
  NOT_REVIEWED: STATUS_LABELS.NOT_REVIEWED,
  SAVED_FOR_LATER: STATUS_LABELS.SAVED_FOR_LATER,
  DECLINED: STATUS_LABELS.DECLINED,
  UNAVAILABLE: STATUS_LABELS.UNAVAILABLE,
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
  return <FilterSelect label="Status" value={value} options={OPTIONS} onChange={onChange} />;
}
