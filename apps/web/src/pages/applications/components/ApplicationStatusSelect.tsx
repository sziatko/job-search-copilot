import { Select, type SelectOption } from '@/components/ui/Select';
import { APPLICATION_STATUS_LABELS } from '../constants';
import { type ApplicationStatus, applicationStatusSchema } from '../types';

const OPTIONS: SelectOption<ApplicationStatus>[] = applicationStatusSchema.options.map((value) => ({
  value,
  label: APPLICATION_STATUS_LABELS[value],
}));

export function ApplicationStatusSelect({
  value,
  disabled,
  onChange,
}: {
  value: ApplicationStatus;
  disabled?: boolean;
  onChange: (value: ApplicationStatus) => void;
}) {
  return <Select value={value} options={OPTIONS} disabled={disabled} onChange={onChange} />;
}
