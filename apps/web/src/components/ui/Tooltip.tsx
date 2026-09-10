import { type ReactNode, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

// Rendered into a portal on <body> rather than positioned relative to the trigger —
// the table wrapper uses overflow-hidden for its rounded corners, which would clip an
// absolutely-positioned tooltip nested inside it no matter how high its z-index is.
//
// The trigger is a <button> (per the WAI-ARIA tooltip pattern): it's the accessible
// way to make the trigger keyboard-focusable so focus/blur can reveal the full text.
// Styled to sit inline; activating it does nothing beyond what hover/focus already do.
export function Tooltip({ content, children }: { content: string; children: ReactNode }) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
  const tooltipId = useId();

  function show() {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    setPosition({ top: rect.top - 8, left: rect.left + rect.width / 2 });
  }

  function hide() {
    setPosition(null);
  }

  const open = position !== null;

  return (
    <button
      type="button"
      ref={triggerRef}
      className="block cursor-default text-left"
      aria-describedby={open ? tooltipId : undefined}
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
    >
      {children}
      {open &&
        createPortal(
          <div
            id={tooltipId}
            role="tooltip"
            style={{ top: position.top, left: position.left }}
            className="pointer-events-none fixed z-50 w-80 max-w-[min(20rem,90vw)] -translate-x-1/2 -translate-y-full rounded-lg bg-slate-900 px-3 py-2 text-xs leading-relaxed whitespace-normal text-white shadow-lg"
          >
            <div>{content}</div>
            <div className="absolute left-1/2 top-full -translate-x-1/2 border-4 border-transparent border-t-slate-900" />
          </div>,
          document.body,
        )}
    </button>
  );
}
