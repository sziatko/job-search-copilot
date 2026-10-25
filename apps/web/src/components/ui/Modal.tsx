import { type ReactNode, type RefObject, useEffect, useRef } from 'react';

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** A modal dialog with a focus trap, Escape and a backdrop that close it (ADR-0013);
 * its content is built from the `Dialog` parts. */
export function Modal({
  onClose,
  labelledBy,
  maxWidthClassName = 'max-w-sm',
  initialFocus,
  children,
}: {
  onClose: () => void;
  /** id of the element (usually an <h2>) that names this dialog, for aria-labelledby. */
  labelledBy?: string;
  maxWidthClassName?: string;
  /** Focused on open instead of the dialog itself (its ref is set when the effect runs). */
  initialFocus?: RefObject<HTMLElement | null>;
  children: ReactNode;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  // Held in a ref so a parent's inline `onClose` does not re-run the effect, which would
  // restore focus to the opener and re-focus the dialog on every parent render.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const initialFocusRef = useRef(initialFocus);
  initialFocusRef.current = initialFocus;

  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const dialog = dialogRef.current;
    (initialFocusRef.current?.current ?? dialog)?.focus();

    // Lock background scroll while the modal is open.
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        onCloseRef.current();
        return;
      }
      if (e.key !== 'Tab' || !dialog) return;
      const focusable = Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (focusable.length === 0) {
        e.preventDefault();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = originalOverflow;
      previouslyFocused?.focus?.();
    };
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* A real <button> so the click-to-close backdrop carries keyboard semantics for
          free; kept out of the tab order (Esc and the explicit buttons close it). */}
      <button
        type="button"
        aria-label="Close dialog"
        tabIndex={-1}
        onClick={onClose}
        className="absolute inset-0 h-full w-full cursor-default bg-scrim backdrop-blur-sm"
      />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        tabIndex={-1}
        className={`relative w-full ${maxWidthClassName} rounded-xl border border-border bg-surface p-5 shadow-pop focus:outline-none`}
      >
        {children}
      </div>
    </div>
  );
}
