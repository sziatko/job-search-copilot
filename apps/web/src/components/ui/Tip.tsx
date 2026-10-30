import type { ReactNode } from 'react';

/** Where the bubble sits over its control: centred, or flush with the edge a centred
 * one would run past (the ⏳ leading a table, the theme toggle trailing the topbar). */
const ALIGN = {
  center: 'left-1/2 -translate-x-1/2',
  start: 'left-0',
  end: 'right-0',
} as const;

/**
 * The bubble over an icon control: the only label the Action column's icons have, the
 * history button's count, the copy buttons' "Copied". The element that directly holds
 * it is its anchor (`relative`) and reveals it on hover or keyboard focus; `show`
 * reveals it from outside, for a flash.
 */
export function Tip({
  align = 'center',
  show,
  role,
  children,
}: {
  align?: keyof typeof ALIGN;
  show?: boolean;
  role?: 'status';
  children: ReactNode;
}) {
  return (
    <span
      role={role}
      className={`pointer-events-none absolute bottom-full z-20 mb-2 whitespace-nowrap rounded-sm bg-ink px-2 py-1 text-caption font-bold text-bg transition-opacity [:focus-visible>&]:opacity-100 [:hover>&]:opacity-100 ${show ? 'opacity-100' : 'opacity-0'} ${ALIGN[align]}`}
    >
      {children}
    </span>
  );
}
