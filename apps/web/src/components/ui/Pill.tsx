import type { ReactNode } from 'react';
import { TONE, type Tone } from './tone';

/** A number-sized label in the mono face, such as a match score — `Tag`'s tones. */
export function Pill({ tone, children }: { tone: Tone; children: ReactNode }) {
  return (
    <span
      className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-1 font-mono text-small leading-4 font-semibold ${TONE[tone]}`}
    >
      {children}
    </span>
  );
}
