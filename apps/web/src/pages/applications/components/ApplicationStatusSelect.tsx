import { Select, type SelectOption } from '@/components/ui/Select';
import { APPLICATION_STATUS_LABELS } from '../constants';
import { type ApplicationStatus, applicationStatusSchema } from '../types';

// Schema order, which is pipeline order: Applied → Action needed → Interview →
// Awaiting → Offer → Rejected. (The mockup lists five of these in a different
// order and has no Offer at all — pipeline order wins.)
const OPTIONS: SelectOption<ApplicationStatus>[] = applicationStatusSchema.options.map((value) => ({
  value,
  label: APPLICATION_STATUS_LABELS[value],
}));

export function ApplicationStatusSelect({
  label = 'Status',
  value,
  disabled,
  onChange,
}: {
  /** A row's select names its row, so a screen reader can tell them apart. */
  label?: string;
  value: ApplicationStatus;
  disabled?: boolean;
  onChange: (value: ApplicationStatus) => void;
}) {
  return (
    <Select label={label} value={value} options={OPTIONS} disabled={disabled} onChange={onChange} />
  );
}
