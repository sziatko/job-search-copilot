import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// Read from disk: vitest hands a CSS import over empty.
const css = readFileSync(`${import.meta.dirname}/index.css`, 'utf8');

/**
 * The styling rules (index.css's header, components/ui/README.md "Styling a new page")
 * held over every source file: what Tailwind would accept but the design system does
 * not. A file is read as text, comments included — whatever builds a class string, its
 * classes are literal, so prose that quotes a forbidden class fails here too.
 */
const sources = import.meta.glob(['./**/*.{ts,tsx}', '!./**/*.test.{ts,tsx}'], {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

/** Arbitrary values that stay: CSS with no scale step, reading tokens where it has
 * colours. Anything new here is a decision — name it as a token first if it can be. */
const ALLOWED_ARBITRARY = [
  /^transition-\[[a-z,-]+\]$/, // which properties animate
  /^grid-cols-\[repeat\(auto-fit,minmax\(150px,1fr\)\)\]$/, // KpiRow's tiles
  /^grid-cols-\[minmax\(0,1\.3fr\)_minmax\(0,1fr\)\]$/, // SplitGrid's two columns
  /^bg-size-\[200%_100%\]$/, // Skeleton's sweep
  /^bg-\[repeating-linear-gradient\(.*var\(--color-[a-z-]+\).*\)\]$/, // Timeline's dashes
  /^max-h-\[60vh\]$/, // a modal list, by the viewport
  /^min-w-\[3%\]$/, // a funnel bar never vanishes
];

const ROLES = [
  'overline',
  'caption',
  'small',
  'body',
  'title',
  'heading',
  'page',
  'headline',
  'display',
];
const COLOURS = [...css.matchAll(/--color-([a-z0-9-]+):/g)].map(([, name]) => name);
/** Every `text-*` a class may be: a role, a colour token, or one of Tailwind's own. */
const TEXT_OK = new Set([
  ...ROLES,
  ...COLOURS,
  ...['left', 'center', 'right', 'justify', 'start', 'end', 'wrap', 'nowrap', 'balance'],
  ...['pretty', 'ellipsis', 'clip', 'transparent', 'current', 'inherit'],
]);

const CLASS = /(?<=^|[\s"'`])[a-z0-9:&>_[\]=.%(),/#+!*@-]+(?=$|[\s"'`])/g;
const SPACING =
  /^-?(p|px|py|pt|pb|pl|pr|ps|pe|m|mx|my|mt|mb|ml|mr|ms|me|gap|gap-x|gap-y|space-x|space-y|inset|inset-x|inset-y|top|bottom|left|right|start|end|translate-x|translate-y|scroll-m[xytblr]?|scroll-p[xytblr]?)-\d+\.\d+$/;
const QUARTER = /-\d+\.(25|75)$/;
// A value in brackets or a `(--var)` shorthand, or a whole `[property:value]`.
const ARBITRARY = /^\[[a-z-]+:.+\]$|^-?[a-z-]+-[[(]/;

/** Every class in a file, its variants (`narrow:`, `[&_svg]:`, `!`) cut off: a colon
 * inside brackets belongs to the class. */
function classes(text: string): string[] {
  return (text.match(CLASS) ?? []).map((c) =>
    (c.split(/:(?![^[]*\])/).pop() ?? c).replace(/^!|!$/g, ''),
  );
}

function offences(test: (c: string) => boolean) {
  const found: string[] = [];
  for (const [file, text] of Object.entries(sources)) {
    for (const c of classes(text)) if (test(c)) found.push(`${file}: ${c}`);
  }
  return found;
}

describe('styles', () => {
  it('reads every source file and the colour tokens', () => {
    expect(Object.keys(sources).length).toBeGreaterThan(50);
    expect(COLOURS).toContain('ink');
  });

  it('spaces on whole steps (4px): no half step on padding, margin, gap or offsets', () => {
    expect(offences((c) => SPACING.test(c))).toEqual([]);
  });

  it('sizes on half steps at most (2px): no quarter step anywhere', () => {
    expect(offences((c) => QUARTER.test(c))).toEqual([]);
  });

  it('sets text by its role: no size, no `role/N`, no unknown text class', () => {
    expect(
      offences((c) => {
        const m = /^text-([a-z0-9-]+?)(?:\/(\d+))?$/.exec(c);
        if (!m) return false;
        // Only a colour takes `/N` (its opacity): on a role it is a line height, and
        // drops the role's weight and tracking with it.
        return m[2] !== undefined ? !COLOURS.includes(m[1]) : !TEXT_OK.has(m[1]);
      }),
    ).toEqual([]);
  });

  it('picks no tracking or leading by hand-written value', () => {
    expect(offences((c) => /^(tracking|leading)-[[(]/.test(c))).toEqual([]);
  });

  it('writes an overline in capitals: `uppercase` beside every `text-overline`', () => {
    const found: string[] = [];
    for (const [file, text] of Object.entries(sources)) {
      for (const line of text.split('\n')) {
        if (/\btext-overline\b/.test(line) && !/\buppercase\b/.test(line))
          found.push(`${file}: ${line.trim()}`);
      }
    }
    expect(found).toEqual([]);
  });

  it('takes no arbitrary value or property that is not on the list', () => {
    expect(
      offences((c) => ARBITRARY.test(c) && !ALLOWED_ARBITRARY.some((ok) => ok.test(c))),
    ).toEqual([]);
  });
});
