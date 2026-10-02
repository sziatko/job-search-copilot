import '@testing-library/jest-dom/vitest';
import { cleanup, configure } from '@testing-library/react';
import { afterAll, afterEach, beforeAll } from 'vitest';
import { mswServer } from './msw/server';

// `findBy*` waits 1000ms by default — a number written for suites that render one
// component. These tests boot the whole router, and the first query in a file also
// pays for a cold module graph; under a loaded machine that exceeds a second, and
// the failure reads as a hang (`Loading…` in the DOM dump, no error from MSW).
// Raising the ceiling hides nothing: the assertion still has to become true.
// 15 s, not 5: one wait on a 100-row render takes ~2 s here, and the machine has run
// up to 4× slower. It stays under the project's 20 s `testTimeout`, so a wait that
// never resolves still fails with its DOM dump rather than a bare timeout.
configure({ asyncUtilTimeout: 15_000 });

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
