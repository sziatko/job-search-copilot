import type { ReactNode } from 'react';
import { IconCross } from '../icons';
import { tagClass } from './Tag';
import { CHIP_COLOR, type ChipColor } from './tone';

/** A label the user owns, such as a vacancy's tag: `Tag`'s shape in any colour, that can
 * wrap a long name and, with `onRemove`, carries a × button named by `removeLabel`, off under
 * `removeDisabled`: `aria-disabled`, not `disabled`, as focus cannot stay on a disabled button and
 * a write puts it on the next ×. `dense` is its size in a table row. */
export function Chip({
  color,
  dense = false,
  children,
  onRemove,
  removeLabel,
  removeDisabled,
}: {
  color: ChipColor;
  dense?: boolean;
  children: ReactNode;
} & (
  | { onRemove: () => void; removeLabel: string; removeDisabled?: boolean }
  | { onRemove?: undefined; removeLabel?: undefined; removeDisabled?: undefined }
)) {
  return (
    <span className={`${tagClass(dense)} ${CHIP_COLOR[color]} max-w-full gap-1`}>
      {/* Unlike a status's word, a name can be wider than its cell. */}
      <span className="min-w-0 whitespace-normal wrap-anywhere">{children}</span>
      {onRemove && (
        <button
          type="button"
          aria-label={removeLabel}
          aria-disabled={removeDisabled}
          onClick={removeDisabled ? undefined : onRemove}
          className="flex-none cursor-pointer hover:text-ink aria-disabled:opacity-50 [&_svg]:size-3"
        >
          <IconCross />
        </button>
      )}
    </span>
  );
}
