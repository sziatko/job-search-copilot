# 0013 — Accessible UI primitives: `Modal`, `ExpandableText`

- Status: Accepted
- Phase: 1 · Date: 2026-09

## Context
The first UI had a `Modal` that was a `div` with an `onClick` backdrop, no focus
trap, no `aria-labelledby`, no scroll lock; and a `Tooltip` on every row's Comment
cell — a hover-only wrapper that Biome flagged as an inaccessible interactive
element.

## Decision
**`Modal`** (`apps/web/src/components/ui/Modal.tsx`):
- `role="dialog"` + `aria-modal` + optional `aria-labelledby` (`labelledBy` prop;
  `ConfirmDialog` and `ApplyDialog` pass their `<h2>` id).
- Focus the dialog on open; **trap** Tab / Shift+Tab within it; **restore** focus
  to the previously-focused element on close.
- `Escape` closes; the backdrop is a real `<button aria-label="Close dialog">`
  (not a `div` with a click handler), kept out of the tab order.
- Locks `document.body` scroll while open.

**`ExpandableText`** (`apps/web/src/components/ui/ExpandableText.tsx`) — replaces
the per-row `Tooltip`:
- Renders the comment clamped to 3 lines. A `ResizeObserver` + callback ref
  measures whether it actually overflows.
- **Fits** → plain `<p>`, nothing interactive, no tab stop.
- **Overflows** → the block becomes one `<button aria-expanded>` (click the text
  *or* the inline "Show more / Show less" label to toggle); re-clamps on blur and
  on `Escape`.

`Tooltip.tsx` is deleted.

## Why this and not the alternatives
For the comment cell specifically:
- **Keep the custom `Tooltip`, `<span>` trigger + a Biome `ignore`** — the ignore
  would suppress a *real* a11y gap (mouse-only, no keyboard/touch), not a false
  positive.
- **`<span title={comment}>`** — honest and zero-JS, but no styling, no
  keyboard-focus reveal, dead on touch.
- **A `<button>` wrapper on every row** (an earlier attempt) — a dead tab stop per
  row and "button" announced for passive text.
- **`ExpandableText`** — one real control, and only on rows whose text is actually
  clamped; works for mouse, keyboard, touch, and screen readers; no portal, no
  one-shot positioning that goes stale on scroll.

## Consequences
- `Biome`'s a11y rules are all back at `error` (the `noAutofocus` warning went
  away when `ApplyDialog`'s salary-input `autoFocus` was removed — `Modal` already
  focuses the dialog).
- Keyboard traversal of the table only gains a tab stop on genuinely-long comments.
- One fewer component; the CSS bundle shrank slightly.

## What this constrains — breaks if you change it
- Reverting the backdrop to a `div` with `onClick`, or dropping the focus
  trap/restore → `Biome` `a11y/noStaticElementInteractions` /
  `useKeyWithClickEvents` fail; keyboard users get trapped or lost.
- Putting a `<button>` (or a `tabIndex` `<span>`) around every comment again →
  the per-row dead-tab-stop problem returns; `Biome` flags it.
- Removing the overflow measurement in `ExpandableText` and always rendering the
  toggle → every row gets a tab stop again.

## Related
[ADR-0014](0014-biome-and-nest-di-import-type.md), `apps/web/src/components/ui/Modal.tsx`,
`apps/web/src/components/ui/ExpandableText.tsx`,
`apps/web/src/components/ui/ExpandableText.test.tsx`.
