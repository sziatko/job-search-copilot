import { Select, type SelectOption } from '@/components/ui/Select';
import { APPLICATION_STATUS_LABELS } from '../constants';
import { type ApplicationStatus, applicationStatusSchema } from '../types';

// Schema order, which is pipeline order: Applied → Recruiter screen → Replied →
// Interview → Offer → Rejected. (The mockup lists five of these in a different
// order and has no Offer at all — pipeline order wins.)
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
  return (
    <Select
      className="status-select"
      value={value}
      options={OPTIONS}
      disabled={disabled}
      onChange={onChange}
    />
  );
}
