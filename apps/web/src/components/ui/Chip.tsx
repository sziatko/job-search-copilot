import type { ReactNode } from 'react';
import { IconCross } from '../icons';
import { Tag } from './Tag';
import type { Tone } from './tone';

/** A label the user owns, such as a vacancy's tag: a `Tag` that can wrap a long name and,
 * with `onRemove`, carries a × button named by `removeLabel`, off under `removeDisabled`. */
export function Chip({
  tone,
  children,
  onRemove,
  removeLabel,
  removeDisabled,
}: {
  tone: Tone;
  children: ReactNode;
} & (
  | { onRemove: () => void; removeLabel: string; removeDisabled?: boolean }
  | { onRemove?: undefined; removeLabel?: undefined; removeDisabled?: undefined }
)) {
  return (
    <Tag tone={tone} className="inline-flex max-w-full items-center gap-1">
      {/* Unlike a status's word, a name can be wider than its cell. */}
      <span className="min-w-0 whitespace-normal wrap-anywhere">{children}</span>
      {onRemove && (
        <button
          type="button"
          aria-label={removeLabel}
          disabled={removeDisabled}
          onClick={onRemove}
          className="flex-none cursor-pointer hover:text-ink disabled:opacity-50 [&_svg]:size-3"
        >
          <IconCross />
        </button>
      )}
    </Tag>
  );
}
