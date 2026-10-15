import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getStoredTheme, setStoredTheme } from './theme';

// The attribute is the whole mechanism and the stored value only remembers which
// one to write, so a bug here is silent in a specific way: the user picks dark,
// the choice is remembered, and the app still paints light. The no-flash boot
// script in index.html reads the same key, which is the other half of the contract.
const STORAGE_KEY = 'jsc-theme';

function mockOs(theme: 'light' | 'dark') {
  vi.spyOn(window, 'matchMedia').mockImplementation(
    (media) => ({ matches: theme === 'dark', media }) as MediaQueryList,
  );
}

beforeEach(() => {
  localStorage.clear();
  document.documentElement.removeAttribute('data-theme');
});

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
  document.documentElement.removeAttribute('data-theme');
});

describe('getStoredTheme', () => {
  it('reads back an explicit choice', () => {
    localStorage.setItem(STORAGE_KEY, 'dark');
    expect(getStoredTheme()).toBe('dark');
    localStorage.setItem(STORAGE_KEY, 'light');
    expect(getStoredTheme()).toBe('light');
  });

  it.each([['DARK'], [''], ['blue'], ['system'], ['null']])(
    'treats %j as no choice at all',
    (raw) => {
      // Only the two exact strings are acknowledged. Anything else — a stale value
      // (including the old 'system'), a hand-edited key, a case variant — falls
      // back to following the OS rather than pinning a theme nobody asked for.
      localStorage.setItem(STORAGE_KEY, raw);
      expect(getStoredTheme()).toBeNull();
    },
  );

  it('survives storage being disabled', () => {
    // Private-mode Safari throws on access rather than returning null.
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied');
    });
    expect(getStoredTheme()).toBeNull();
  });
});

describe('setStoredTheme', () => {
  it('swallows a storage failure — the choice just will not survive a reload', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('denied');
    });
    expect(() => setStoredTheme('dark')).not.toThrow();
  });
});

describe('useTheme', () => {
  // The choice is read from storage once, when the module loads — a page load. Each
  // test sets storage up first, then loads a fresh copy.
  async function loadUseTheme() {
    vi.resetModules();
    return (await import('./theme')).useTheme;
  }

  it('starts from the stored choice, whatever the OS says', async () => {
    mockOs('light');
    localStorage.setItem(STORAGE_KEY, 'dark');
    const useTheme = await loadUseTheme();
    const { result } = renderHook(() => useTheme());
    expect(result.current.theme).toBe('dark');
  });

  it('a click repaints every consumer, not only the one clicked', async () => {
    // The header's toggle and the toaster each call useTheme: one shared store, or
    // the toaster would keep the old theme until a reload.
    mockOs('light');
    const useTheme = await loadUseTheme();
    const toggle = renderHook(() => useTheme());
    const toaster = renderHook(() => useTheme());
    expect(toaster.result.current.stored).toBeNull();

    act(() => toggle.result.current.toggle());
    expect(toaster.result.current.stored).toBe('dark');
    expect(toaster.result.current.theme).toBe('dark');
  });

  it('a click still works for the session when storage is disabled', async () => {
    mockOs('light');
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('denied');
    });
    const useTheme = await loadUseTheme();
    const { result } = renderHook(() => useTheme());

    act(() => result.current.toggle());
    expect(result.current.theme).toBe('dark');
    act(() => result.current.toggle());
    expect(result.current.theme).toBe('light');
  });

  it.each([
    ['light', 'dark'],
    ['dark', 'light'],
  ] as const)(
    'with nothing stored, on a %s OS: shows it, and the first click flips to %s',
    async (os, flipped) => {
      mockOs(os);
      const useTheme = await loadUseTheme();
      const { result } = renderHook(() => useTheme());
      expect(result.current.theme).toBe(os);
      // Nothing is written until a click: the CSS media query decides meanwhile.
      expect(document.documentElement.hasAttribute('data-theme')).toBe(false);

      act(() => result.current.toggle());
      expect(result.current.theme).toBe(flipped);
      expect(document.documentElement.getAttribute('data-theme')).toBe(flipped);
      expect(localStorage.getItem(STORAGE_KEY)).toBe(flipped);

      // A second click flips back — pinned now, not "follow the OS" again.
      act(() => result.current.toggle());
      expect(result.current.theme).toBe(os);
      expect(document.documentElement.getAttribute('data-theme')).toBe(os);
      expect(localStorage.getItem(STORAGE_KEY)).toBe(os);
    },
  );
});
