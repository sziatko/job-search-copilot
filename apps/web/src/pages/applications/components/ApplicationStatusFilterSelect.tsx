import { FilterSelect, type SelectOption } from '@/components/ui/Select';
import { APPLICATION_STATUS_LABELS, FILTER_LABELS } from '@/lib/applications/constants';
import {
  type ApplicationStatusFilter,
  applicationStatusFilterValues,
} from '@/lib/applications/types';

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
  return <FilterSelect label="Status" value={value} options={OPTIONS} onChange={onChange} />;
}
