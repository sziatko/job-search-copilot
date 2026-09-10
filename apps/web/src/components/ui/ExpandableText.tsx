import { useCallback, useRef, useState } from 'react';

/**
 * Text that clamps to 3 lines. When it actually overflows, the whole block becomes
 * one <button> (click anywhere — text or the inline "Show more" label — to toggle)
 * that expands it in place; it re-clamps on blur or Escape. When the text fits,
 * there is no interactive element and no extra tab stop.
 */
export function ExpandableText({ text }: { text: string }) {
  const [clampable, setClampable] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const observerRef = useRef<ResizeObserver | null>(null);
  const expandedRef = useRef(expanded);
  expandedRef.current = expanded;

  // Callback ref: re-runs whenever the measured node mounts / unmounts, which also
  // covers the <p> ⇄ <button> swap below. Measures overflow only while clamped.
  const measureRef = useCallback((el: HTMLSpanElement | null) => {
    observerRef.current?.disconnect();
    if (!el) return;
    const check = () => {
      if (!expandedRef.current) setClampable(el.scrollHeight > el.clientHeight + 1);
    };
    check();
    observerRef.current = new ResizeObserver(check);
    observerRef.current.observe(el);
  }, []);

  const textSpan = (
    <span ref={measureRef} className={expanded ? 'block' : 'line-clamp-3'}>
      {text}
    </span>
  );

  if (!clampable) {
    return <p className="text-sm text-slate-600">{textSpan}</p>;
  }

  return (
    <button
      type="button"
      aria-expanded={expanded}
      onClick={() => setExpanded((v) => !v)}
      onBlur={() => setExpanded(false)}
      onKeyDown={(e) => {
        if (e.key === 'Escape') setExpanded(false);
      }}
      className="block w-full cursor-pointer text-left text-sm text-slate-600"
    >
      {textSpan}
      <span className="mt-0.5 block text-xs font-medium text-indigo-600">
        {expanded ? 'Show less' : 'Show more'}
      </span>
    </button>
  );
}
