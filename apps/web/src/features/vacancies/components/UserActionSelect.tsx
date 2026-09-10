import { Select, type SelectOption } from '@/components/ui/Select';
import type { UserAction } from '../types';

const OPTIONS: SelectOption<UserAction>[] = [
  { value: 'NOT_REVIEWED', label: 'Not reviewed' },
  { value: 'READY_TO_APPLY', label: 'Ready to apply' },
  { value: 'APPLIED', label: 'Applied' },
  { value: 'DECLINED', label: 'Declined' },
];

export function UserActionSelect({
  value,
  disabled,
  onChange,
}: {
  value: UserAction;
  disabled?: boolean;
  onChange: (value: UserAction) => void;
}) {
  return <Select value={value} options={OPTIONS} disabled={disabled} onChange={onChange} />;
}
