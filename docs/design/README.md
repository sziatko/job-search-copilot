# Design references

Visual references for the web UI. **Nothing here is prose** — it is excluded from
Biome (`biome.json`) and is not part of the docs corpus. Read
[`../architecture.md`](../architecture.md) for how the system works.

| File | What it is |
| --- | --- |
| `dashboard-reference_2.html` | The self-contained mockup `apps/web` was designed against: ~1000 lines of HTML, Tailwind utilities, and vanilla JS with made-up sample data. **Open it in a browser** to see the intended result — reading the source tells you far less. |
| `vacancy-detail-reference.html` | The vacancy page's mockup, in the same design system. |

These are where the UI started, not what it is: the app has moved on from them since,
and the running app is the current picture.

The decisions that mockup encodes do not live in the HTML. The theme tokens
(colour, type, spacing, and the light/dark overrides) are in
[`apps/web/src/index.css`](../../apps/web/src/index.css); the layout and component
structure are the React components under `apps/web/src/components/`.
