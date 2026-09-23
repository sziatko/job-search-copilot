import { useEffect, useRef } from 'react';
import { IconMore } from '@/components/icons';
import { USER_ACTION_LABELS } from '../constants';
import { USER_ACTION, type UserAction } from '../types';

/** The statuses that don't earn a button of their own in every row. */
const MENU_ACTIONS: UserAction[] = [USER_ACTION.NOT_REVIEWED, USER_ACTION.READY_TO_APPLY];

/**
 * The action cell's ⋯ trigger: a native `popover="auto"`, so it renders in the
 * browser's top layer and is not clipped by `.table-body-scroll`.
 */
export function RowActionMenu({
  disabled,
  onAction,
}: {
  disabled?: boolean;
  onAction: (userAction: UserAction) => void;
}) {
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

  function open() {
    const menu = menuRef.current;
    const trigger = triggerRef.current;
    if (!menu || !trigger) return;
    const rect = trigger.getBoundingClientRect();
    // Anchored to the trigger's bottom-right: this sits in the last column, so a
    // left-anchored menu would run off the viewport. `right` is measured from the
    // viewport edge, which is also what makes a horizontally scrolled table work.
    menu.style.top = `${rect.bottom + 4}px`;
    menu.style.right = `${window.innerWidth - rect.right}px`;
    menu.showPopover();
  }

  function pick(userAction: UserAction) {
    // Close *before* handing the choice up: an open popover lives in the top
    // layer, above the modal an APPLIED/DECLINED choice opens.
    menuRef.current?.hidePopover();
    onAction(userAction);
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-label="More statuses"
        disabled={disabled}
        onClick={open}
        className="icon-btn disabled:opacity-50"
      >
        <IconMore />
        <span className="tip">More</span>
      </button>
      <div ref={menuRef} popover="auto" role="menu" aria-label="Set status" className="row-menu">
        {MENU_ACTIONS.map((userAction) => (
          <button key={userAction} type="button" role="menuitem" onClick={() => pick(userAction)}>
            {USER_ACTION_LABELS[userAction]}
          </button>
        ))}
      </div>
    </>
  );
}
