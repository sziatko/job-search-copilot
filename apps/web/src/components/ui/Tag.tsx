import type { ReactNode } from 'react';
import { TONE, type Tone } from './tone';

/** A tag's shape, without its colour: `Tag` and `Chip`. `dense` is its size in a table row
 * with many of them. */
export function tagClass(dense: boolean): string {
  return `inline-flex items-center whitespace-nowrap rounded-full border px-2 ${dense ? 'py-0' : 'py-1'} font-sans text-caption font-bold`;
}

/** A word-sized status label: a vacancy's status, the analyzer's recommendation. */
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
  return <span className={`${tagClass(dense)} ${TONE[tone]} ${className}`}>{children}</span>;
}
