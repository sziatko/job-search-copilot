# `components/ui` — the web app's UI library

The primitives every page is built from: buttons, cards, tags, form fields, dialog
parts, empty and loading states. Each one owns its look; a page only arranges them.
The catalogue is this folder: one component (or a few small parts of one) per file,
each with a one-line doc comment saying what it is for.

## Using one

- **Look here before writing markup.** A button is `<Button>`, a dialog's heading is
  `<DialogTitle>`, a "nothing here" message is `<EmptyState>` — never a `<button>` with
  a class string, never a class from `index.css`.
- **Pick the look with the variant prop** (`variant`, `tone`), not with classes.
  `className`, where a primitive takes one, is for what the primitive does not set
  itself: a margin, `ml-auto`, a flex role in the parent. Two Tailwind classes for the
  same property do not override each other by order in the string — whichever the
  stylesheet emits later wins — so a `className` that restyles a primitive is a bug
  waiting for a reordering.
- **A page's body is a `View`** (`fill` on a list page), under the shell's topbar.
- **A link that looks like a button** takes `buttonClass(variant)` (`Button.tsx`).
- **A list is a `Table` of column definitions** — each a header, a width and a `cell`
  — never a `<table>` by hand; its cells come from `TableCells.tsx` where one fits. A
  list page puts it in a `ListFrame`, which owns the card, the toolbar and the fill
  down to the window's bottom.
- **A cell that changes the text size wraps it in a block** (`<div className="text-small">`),
  not a `<span>`: inline, the smaller text still sits on the cell's own taller line.

## Styling a new page

What a primitive does not cover is styled from the tokens in `index.css` (its header
comment has the details), and `src/styles.test.ts` fails on anything else:

- **Text by role, not by size**: `text-overline` (a small uppercase label — add
  `uppercase`), `text-caption` (meta, tags, tips), `text-small` (a sub-line),
  `text-body` (the reading size), `text-title` (a card's), `text-heading` (a dialog's),
  `text-page` (the top bar's), `text-headline` (a page's subject), `text-display` (a
  KPI's number). A role brings its line height, weight and letter-spacing; a
  `font-*` beside it changes the weight, a `leading-*` the line height — never
  `text-title/5`, which drops the role's weight and tracking.
- **Space on whole steps** — `p-*`, `m-*`, `gap-*`, offsets on Tailwind's 4px scale;
  a size (`size-*`, `w-*`, `h-*`, `leading-*`) may take a half step (2px). No arbitrary
  value (`w-[35%]` is `w-7/20`); the few CSS ones that stay are listed in the spec.
- **Colour by meaning**: neutrals (`bg`, `surface*`, `border*`, `ink*` — `ink-faint` for
  secondary text only), and a tone from `tone.ts` for anything that says good, caution,
  bad or accent: `TONE` (a tinted label), `TONE_FILL` (a badge), `TONE_TEXT` (a big
  number), `TONE_DOT` (a dot, a bar). A status's tone is its `STATUS_TAGS` entry
  (`lib/vacancies/constants.ts`) — one map, so a status looks the same everywhere.
- **Meta beside the content** (a date, a time ago, a ratio) is a `Meta`.

## Adding one

A piece that a second page needs, or that a page would otherwise style by hand, becomes
a primitive here — not a component inside a page, and not a class in `index.css`.

- **Styles only from tokens**, as "Styling a new page" says: the text roles, radii and
  colours of `@theme` in `src/index.css`, and Tailwind's spacing scale (`px-4`, not
  `px-[16px]`). No raw colour (`#fff`, `rgba(…)`, a Tailwind
  palette name such as `bg-slate-50`). A value the design needs and the tokens lack is
  a new token there.
- **Variants as a plain object map** — `const VARIANTS = { primary: '…', danger: '…' }`,
  indexed by the prop, its keys the prop's type (`keyof typeof VARIANTS`). No `cva` /
  `clsx`: a template string joins the parts.
- **Presentational only**: props in, markup out. No data fetching, no imports from
  `pages/`.
- **A vitest spec beside it** (`Button.test.tsx`), on what it does — its role, its
  name, what a click does — found the way every test finds elements
  ([`docs/development.md` § Testing](../../../../../docs/development.md#testing)).
- **It appears in the visual tests** (`e2e/visual.spec.ts`): through a page that uses
  it, or a shot of its own when no page shows it yet.
