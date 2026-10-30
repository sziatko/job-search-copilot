import type { ReactNode } from 'react';
import { TONE, type Tone } from './tone';

/** A word-sized status label: a vacancy's status, the analyzer's recommendation. */
export function Tag({
  tone,
  className = '',
  children,
}: {
  tone: Tone;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      className={`whitespace-nowrap rounded-full border px-2 py-1 font-sans text-caption font-bold ${TONE[tone]} ${className}`}
    >
      {children}
    </span>
  );
}
