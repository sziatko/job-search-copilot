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

// jsdom has no matchMedia either. The theme module reads it for the OS
// preference, and RootLayout renders the theme toggle on every page.
// (`typeof` rather than `'matchMedia' in window`: that narrower collapses
// `window` to `never`, because lib.dom already declares the property.)
if (typeof window.matchMedia !== 'function') {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}

// jsdom *does* define window.scrollTo — but its body only reports "Not implemented"
// to the virtual console. RootLayout resets scroll on every navigation, and every
// page in this suite renders that shell, so the notice printed dozens of times a run
// and buried the real output. Replaced outright, hence no `typeof` guard: a guard
// would see jsdom's function and skip.
window.scrollTo = (() => {}) as typeof window.scrollTo;

// jsdom 30 half-implements the Popover API: `showPopover()` exists and moves the
// element's internal state, but its CSS engine does not know `:popover-open`, so
// `[popover]:not(:popover-open){display:none}` matches whether or not the popover
// is open, keeping the element hidden for good — invisible to every role query.
// Overriding the two methods (unconditionally: the built-in ones are the trap) to
// toggle a class, plus the rule below to define what that class means, is the whole
// stand-in. Setting the inline `display` instead would work for the menu and break
// the next popover-based component that relies on being hidden while closed.
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
