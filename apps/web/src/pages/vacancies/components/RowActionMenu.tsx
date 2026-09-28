import { type ToggleEvent, useEffect, useId, useRef } from 'react';
import { IconMore } from '@/components/icons';
import { MENU_ACTIONS, STATUS_LABELS } from '../constants';
import type { VacancyAction } from '../types';

/**
 * The action cell's ⋯ trigger: a native `popover="auto"`, so it renders in the
 * browser's top layer and is not clipped by `.table-body-scroll`.
 *
 * The trigger is a **declarative invoker** (`popovertarget`), not a click handler:
 * the browser's own activation behaviour owns show *and* hide, so a second click
 * closes the menu it opened. A handler cannot do that — with `popover="auto"` the
 * light dismiss runs on pointerup, *before* any click listener, so by the time one
 * runs the menu is already closed and every check reads "closed, so open it".
 */
export function RowActionMenu({
  disabled,
  onAction,
}: {
  disabled?: boolean;
  onAction: (status: VacancyAction) => void;
}) {
  // One id per row: the invoker finds its popover by id, so two rows cannot open
  // each other's menus.
  const menuId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // A fixed menu detaches from its row the moment the table scrolls under it, and
  // the virtualizer unmounts rows as they leave the window — so any scroll closes
  // it. Capture phase, because the scrolling element is the table's own box rather
  // than the document.
  useEffect(() => {
    const close = () => menuRef.current?.hidePopover();
    document.addEventListener('scroll', close, true);
    return () => document.removeEventListener('scroll', close, true);
  }, []);

  /**
   * Where the menu goes, measured as it opens — `beforetoggle` is the synchronous
   * hook for that, and it is the only one that works with an invoker: the click has
   * already happened, and `toggle` fires from a queued task, i.e. after the menu has
   * painted at its old coordinates.
   */
  function position(event: ToggleEvent<HTMLDivElement>) {
    const menu = menuRef.current;
    const trigger = triggerRef.current;
    if (event.newState !== 'open' || !menu || !trigger) return;
    const rect = trigger.getBoundingClientRect();
    // Anchored to the trigger's bottom-right: this sits in the last column, so a
    // left-anchored menu would run off the viewport. `right` is measured from the
    // viewport edge, which is also what makes a horizontally scrolled table work.
    menu.style.top = `${rect.bottom + 4}px`;
    menu.style.right = `${window.innerWidth - rect.right}px`;
  }

  function pick(status: VacancyAction) {
    // Close *before* handing the choice up: an open popover lives in the top
    // layer, above the modal an APPLIED/DECLINED choice opens.
    menuRef.current?.hidePopover();
    onAction(status);
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-label="More statuses"
        disabled={disabled}
        popoverTarget={menuId}
        className="icon-btn disabled:opacity-50"
      >
        <IconMore />
        <span className="tip">More</span>
      </button>
      <div
        id={menuId}
        ref={menuRef}
        popover="auto"
        onBeforeToggle={position}
        role="menu"
        aria-label="Set status"
        className="row-menu"
      >
        {MENU_ACTIONS.map((status) => (
          <button key={status} type="button" role="menuitem" onClick={() => pick(status)}>
            {STATUS_LABELS[status]}
          </button>
        ))}
      </div>
    </>
  );
}
