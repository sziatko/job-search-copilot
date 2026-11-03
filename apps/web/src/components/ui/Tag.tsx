import type { ReactNode } from 'react';
import { TONE, type Tone } from './tone';

/** A word-sized status label: a vacancy's status, the analyzer's recommendation. `dense` is
 * its size in a table row with many of them. */
export function Tag({
  tone,
  dense = false,
  className = '',
  children,
}: {
  tone: Tone;
  dense?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      className={`whitespace-nowrap rounded-full border px-2 ${dense ? 'py-0' : 'py-1'} font-sans text-caption font-bold ${TONE[tone]} ${className}`}
    >
      {children}
    </span>
  );
}
