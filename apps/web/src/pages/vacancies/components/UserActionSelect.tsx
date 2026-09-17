import { Select, type SelectOption } from '@/components/ui/Select';
import { USER_ACTION_LABELS } from '../constants';
import { type UserAction, userActionSchema } from '../types';

const OPTIONS: SelectOption<UserAction>[] = userActionSchema.options.map((value) => ({
  value,
  label: USER_ACTION_LABELS[value],
}));

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
