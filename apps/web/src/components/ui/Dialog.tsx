import type { HTMLAttributes } from 'react';

/** The parts a dialog's content is made of, inside a `Modal`. The title's `id` is what
 * the `Modal`'s `labelledBy` names. */
export function DialogTitle(props: HTMLAttributes<HTMLHeadingElement>) {
  return <h2 className="text-2xl font-extrabold" {...props} />;
}

/** The line under the title: what the dialog is about. */
export function DialogSub(props: HTMLAttributes<HTMLParagraphElement>) {
  return <p className="mt-1 text-base text-ink-muted" {...props} />;
}

/** The buttons at the bottom, right-aligned — Cancel first, the action last. */
export function DialogActions(props: HTMLAttributes<HTMLDivElement>) {
  return <div className="mt-6 flex justify-end gap-2.5" {...props} />;
}
