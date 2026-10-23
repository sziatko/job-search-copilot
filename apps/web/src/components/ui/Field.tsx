import type { ComponentProps, ReactNode } from 'react';

const CONTROL =
  'w-full rounded-md border border-border-strong bg-surface px-3 py-2 text-base text-ink focus:outline-2 focus:outline-offset-0 focus:outline-accent-soft-border';

/** A form control's visible name, above it. */
export function Label({ htmlFor, children }: { htmlFor: string; children: ReactNode }) {
  return (
    <label htmlFor={htmlFor} className="mb-1.5 block text-sm font-bold text-ink-soft">
      {children}
    </label>
  );
}

/** A one-line text field. */
export function Input(props: ComponentProps<'input'>) {
  return <input className={CONTROL} {...props} />;
}

/** A multi-line text field, resizable in height. */
export function Textarea(props: ComponentProps<'textarea'>) {
  return <textarea className={`${CONTROL} resize-y`} {...props} />;
}

/** A checkbox — or a radio, by `type` — inside its own label. Dimmed when disabled. */
export function Checkbox({
  label,
  type = 'checkbox',
  ...props
}: Omit<ComponentProps<'input'>, 'type'> & { label: ReactNode; type?: 'checkbox' | 'radio' }) {
  return (
    <label className="flex items-center gap-2 text-base text-ink-soft has-disabled:opacity-50">
      <input type={type} className="size-4 accent-accent" {...props} />
      {label}
    </label>
  );
}
