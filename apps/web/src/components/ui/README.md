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
- **A link that looks like a button** takes `buttonClass(variant)` (`Button.tsx`).

## Adding one

A piece that a second page needs, or that a page would otherwise style by hand, becomes
a primitive here — not a component inside a page, and not a class in `index.css`.

- **Styles only from tokens**: the text sizes, radii and colours of `@theme` in
  `src/index.css`, and Tailwind's spacing scale (`px-4.5`, not `px-[18px]`). No
  arbitrary `[Npx]` where a token exists, no raw colour (`#fff`, `rgba(…)`, a Tailwind
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
