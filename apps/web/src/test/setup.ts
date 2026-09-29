import '@testing-library/jest-dom/vitest';
import { cleanup, configure } from '@testing-library/react';
import { afterAll, afterEach, beforeAll } from 'vitest';
import { mswServer } from './msw/server';

// `findBy*` waits 1000ms by default — a number written for suites that render one
// component. These tests boot the whole router, and the first query in a file also
// pays for a cold module graph; under a loaded machine that exceeds a second, and
// the failure reads as a hang (`Loading…` in the DOM dump, no error from MSW).
// Raising the ceiling hides nothing: the assertion still has to become true.
configure({ asyncUtilTimeout: 5000 });

// jsdom has no ResizeObserver; ExpandableText and @tanstack/react-virtual construct
// one. Invoke the callback on observe() so the virtualizer measures its scroll
// element (ExpandableText's own test installs a richer stub on top for its
// overflow-measurement cases).
if (!('ResizeObserver' in globalThis)) {
  globalThis.ResizeObserver = class {
    #cb: ResizeObserverCallback;
    constructor(cb: ResizeObserverCallback) {
      this.#cb = cb;
    }
    observe(el: Element) {
      this.#cb(
        [{ target: el, contentRect: el.getBoundingClientRect() } as ResizeObserverEntry],
        this,
      );
    }
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
}

// jsdom has no matchMedia; the theme toggle reads the OS theme through it on every
// page's shell. Light, as an OS with no preference reports; theme.test.ts spies on
// it to answer both ways.
if (!window.matchMedia) {
  window.matchMedia = ((media: string) => ({ matches: false, media })) as typeof window.matchMedia;
}

// jsdom *does* define window.scrollTo — but its body only reports "Not implemented"
// to the virtual console. RootLayout resets scroll on every navigation, and every
// page in this suite renders that shell, so the notice printed dozens of times a run
// and buried the real output. Replaced outright, hence no `typeof` guard: a guard
// would see jsdom's function and skip.
window.scrollTo = (() => {}) as typeof window.scrollTo;

// jsdom 30 has no Popover API at all — `typeof el.showPopover` is `undefined`, and
// the only trace of it is a UA-stylesheet rule (`[popover]:not(:popover-open)
// {display:none}`, which its selector engine cannot match either way). So this
// block *is* the API here: two methods that toggle a class, the rule below that says
// what the class means, and the declarative invoker the ⋯ menu opens through.
// Setting the inline `display` instead would work for the menu and break the next
// popover-based component that relies on being hidden while closed.
if (typeof document !== 'undefined' && !document.getElementById('jsdom-popover-stub')) {
  const style = document.createElement('style');
  style.id = 'jsdom-popover-stub';
  // `!important` on both is a jsdom-local necessity — it has to beat whatever
  // jsdom's own sheet does here. It is NOT the real browser's rule: the UA rule
  // hiding a closed popover is not `!important`, which is exactly why author CSS
  // can defeat it, and why the app carries its own guard (see the `[popover]`
  // rule in index.css — that one is what the browser actually honours).
  style.textContent =
    '[popover]{display:none !important}[popover].popover-open{display:block !important}';
  document.head.append(style);

  HTMLElement.prototype.showPopover = function (this: HTMLElement) {
    this.classList.add('popover-open');
  };
  HTMLElement.prototype.hidePopover = function (this: HTMLElement) {
    this.classList.remove('popover-open');
  };

  /** The declarative invoker, which is how the ⋯ menu opens: a click on
   * `[popovertarget]` toggles that element's popover, firing `beforetoggle` first.
   * The app positions itself in that event, so a stub that skipped straight to
   * `showPopover` would leave every menu at `top: 0` and prove nothing.
   *
   * Light dismiss, `:popover-open` and the top layer stay unmodelled on purpose —
   * a stub that guessed the spec's ordering would make the tests disagree with the
   * browser rather than with the app (phase 2.2, step 5: a second click closing the
   * menu is a real-browser claim, checked by the CDP pass). */
  document.addEventListener('click', (event) => {
    const trigger = (event.target as Element | null)?.closest?.('[popovertarget]');
    const targetId = trigger?.getAttribute('popovertarget');
    const menu = targetId ? document.getElementById(targetId) : null;
    if (!menu) return;
    const opens = !menu.classList.contains('popover-open');
    const before = new Event('beforetoggle');
    Object.assign(before, {
      newState: opens ? 'open' : 'closed',
      oldState: opens ? 'closed' : 'open',
    });
    menu.dispatchEvent(before);
    if (opens) menu.showPopover();
    else menu.hidePopover();
  });
}

// jsdom lays nothing out — every measurement is 0, which makes the row virtualizer
// render an empty window. Give elements a usable box so tests that render a
// virtualized table see rows.
if (typeof Element !== 'undefined') {
  Element.prototype.getBoundingClientRect = function getBoundingClientRect(): DOMRect {
    return {
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      right: 1024,
      bottom: 768,
      width: 1024,
      height: 768,
      toJSON: () => ({}),
    } as DOMRect;
  };
  for (const [prop, value] of [
    ['clientHeight', 768],
    ['clientWidth', 1024],
    ['offsetHeight', 768],
    ['offsetWidth', 1024],
    ['scrollHeight', 768],
    ['scrollWidth', 1024],
  ] as const) {
    Object.defineProperty(HTMLElement.prototype, prop, { configurable: true, get: () => value });
  }
}

beforeAll(() => mswServer.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  mswServer.resetHandlers();
  cleanup();
});
afterAll(() => mswServer.close());
