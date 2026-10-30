import type { ReactNode } from 'react';

/** What a list, a card or a dialog shows in place of content it does not have — or
 * could not load. `title` gives it a bold first line. */
export function EmptyState({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <div className="px-4 py-12 text-center text-body text-ink-muted">
      {title && <p className="mb-1 font-bold text-ink">{title}</p>}
      {children}
    </div>
  );
}
