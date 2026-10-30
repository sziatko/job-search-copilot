# 0013 — Accessible UI primitives: `Modal`, `ExpandableText`

- Status: Accepted · Date: 2026-09

## Context
Dialogs and long table text are everywhere in the web. A `div` with a click handler
for a backdrop, a dialog without a focus trap, or a hover-only tooltip on every row
leaves keyboard, touch and screen-reader users out, and Biome's a11y rules flag them.

## Decision
**`Modal`** (`apps/web/src/components/ui/Modal.tsx`):
- `role="dialog"`, `aria-modal`, `aria-labelledby` from a `labelledBy` prop;
- focuses the dialog on open (or `initialFocus`), **traps** Tab / Shift+Tab, and
  **restores** focus on close;
- `Escape` closes; the backdrop is a real `<button aria-label="Close dialog">`, out of
  the tab order;
- locks the body's scroll while open.

**`ExpandableText`** (`apps/web/src/components/ui/ExpandableText.tsx`) for long text
in a cell: clamped to 2 lines; a `ResizeObserver` measures whether it overflows. Only
when it does, a ghost `Button` with `aria-expanded` below it toggles "Show more / Show
less"; `Escape` on it collapses. Text that fits gets no button and no tab stop.

## Why this and not the alternatives
- **A custom hover tooltip with a Biome ignore** — the ignore would hide a real gap:
  mouse only.
- **`title=`** — no keyboard reveal, nothing on touch.
- **A button around every cell** — a dead tab stop per row, and "button" announced
  for passive text.

## Consequences
- Biome's a11y rules stay at `error`.
- The table gains a tab stop only where text is actually clamped.

## What this constrains — breaks if you change it
- A `div` backdrop with `onClick`, or no focus trap / restore → Biome's
  `noStaticElementInteractions` / `useKeyWithClickEvents` fail; keyboard users get
  lost.
- Always rendering the toggle (no overflow measurement) → a tab stop on every row.

## Related
[ADR-0014](0014-biome-and-nest-di-import-type.md), `Modal.test.tsx`,
`ExpandableText.test.tsx`.
