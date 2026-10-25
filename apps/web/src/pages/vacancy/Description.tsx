import { useLayoutEffect, useRef, useState } from 'react';
import { EmptyState } from '@/components/ui/EmptyState';

/** The posting, clamped with a fade; the toggle shows only when the text overflows. */
export function Description({ text }: { text: string | null }) {
  const [clampable, setClampable] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const bodyRef = useRef<HTMLDivElement>(null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: re-measure when the text changes
  useLayoutEffect(() => {
    const el = bodyRef.current;
    setClampable(!!el && el.scrollHeight > el.clientHeight + 2);
  }, [text]);

  if (!text?.trim()) {
    return <EmptyState title="No posting text">None has come in for this vacancy yet.</EmptyState>;
  }

  return (
    <>
      <div className="relative">
        <div
          ref={bodyRef}
          className={`overflow-hidden whitespace-pre-line px-4.5 pt-0.5 pb-4.5 text-base leading-5.25 text-ink-soft ${expanded ? '' : 'max-h-55'}`}
        >
          {text}
        </div>
        {clampable && !expanded && (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-[linear-gradient(to_bottom,transparent,var(--color-surface))]" />
        )}
      </div>
      {clampable && (
        <button
          type="button"
          className="mx-4.5 mt-2.5 mb-4 inline-flex cursor-pointer items-center gap-1.25 rounded-md border border-border-strong bg-surface px-2.5 py-1.5 text-sm font-bold text-accent-ink hover:border-accent-soft-border hover:bg-accent-soft"
          aria-expanded={expanded}
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded ? 'Show less' : 'Show full description'}
        </button>
      )}
    </>
  );
}
