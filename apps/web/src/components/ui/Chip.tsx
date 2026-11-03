import type { ReactNode } from 'react';
import { IconCross } from '../icons';
import { Tag } from './Tag';
import type { Tone } from './tone';

/** A label the user owns, such as a vacancy's tag: a `Tag` that can wrap a long name and,
 * with `onRemove`, carries a × button named by `removeLabel`. */
export function Chip({
  tone,
  children,
  onRemove,
  removeLabel,
}: {
  tone: Tone;
  children: ReactNode;
} & (
  | { onRemove: () => void; removeLabel: string }
  | { onRemove?: undefined; removeLabel?: undefined }
)) {
  return (
    <Tag tone={tone} className="inline-flex max-w-full items-center gap-1">
      {/* Unlike a status's word, a name can be wider than its cell. */}
      <span className="min-w-0 whitespace-normal wrap-anywhere">{children}</span>
      {onRemove && (
        <button
          type="button"
          aria-label={removeLabel}
          onClick={onRemove}
          className="flex-none cursor-pointer hover:text-ink [&_svg]:size-3"
        >
          <IconCross />
        </button>
      )}
    </Tag>
  );
}
