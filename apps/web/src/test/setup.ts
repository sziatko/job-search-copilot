import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterAll, afterEach, beforeAll } from 'vitest';
import { mswServer } from './msw/server';

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
