import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { applyPreference, getStoredPreference, setStoredPreference, useTheme } from './theme';

// The attribute is the whole mechanism and the stored value only remembers which
// one to write, so a bug here is silent in a specific way: the user picks dark,
// the preference is remembered, and the app still paints light. The no-flash boot
// script in index.html reads the same key, which is the other half of the contract.
const STORAGE_KEY = 'jsc-theme';

beforeEach(() => {
  localStorage.clear();
  document.documentElement.removeAttribute('data-theme');
});

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
  document.documentElement.removeAttribute('data-theme');
});

describe('getStoredPreference', () => {
  it('reads back an explicit choice', () => {
    localStorage.setItem(STORAGE_KEY, 'dark');
    expect(getStoredPreference()).toBe('dark');
    localStorage.setItem(STORAGE_KEY, 'light');
    expect(getStoredPreference()).toBe('light');
  });

  it.each([['DARK'], [''], ['blue'], ['system'], ['null']])(
    'treats %j as no choice at all',
    (raw) => {
      // Only the two exact strings are acknowledged. Anything else — a stale value,
      // a hand-edited key, a case variant — falls back to following the OS rather
      // than pinning a theme nobody asked for.
      localStorage.setItem(STORAGE_KEY, raw);
      expect(getStoredPreference()).toBe('system');
    },
  );

  it('survives storage being disabled', () => {
    // Private-mode Safari throws on access rather than returning null.
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied');
    });
    expect(getStoredPreference()).toBe('system');
  });
});

describe('applyPreference', () => {
  it('pins an explicit theme with the attribute', () => {
    applyPreference('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    applyPreference('light');
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
  });

  it('removes the attribute for "system" rather than writing a third value', () => {
    // The *absence* of the attribute is what lets index.css's
    // prefers-color-scheme block decide — and what lets it keep following the OS
    // live. Writing data-theme="system" would freeze the page on whatever the
    // media query said at load.
    applyPreference('dark');
    applyPreference('system');
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false);
  });
});

describe('setStoredPreference', () => {
  it('remembers an explicit choice and forgets "system"', () => {
    setStoredPreference('dark');
    expect(localStorage.getItem(STORAGE_KEY)).toBe('dark');
    setStoredPreference('system');
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it('swallows a storage failure — the choice just will not survive a reload', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('denied');
    });
    expect(() => setStoredPreference('dark')).not.toThrow();
  });
});

describe('useTheme', () => {
  it('starts from the stored choice', () => {
    localStorage.setItem(STORAGE_KEY, 'dark');
    const { result } = renderHook(() => useTheme());
    expect(result.current.preference).toBe('dark');
    expect(result.current.isDark).toBe(true);
  });

  it('follows the OS when nothing is stored', () => {
    const { result } = renderHook(() => useTheme());
    expect(result.current.preference).toBe('system');
    // The suite's matchMedia stub reports light, so 'system' resolves to light.
    expect(result.current.isDark).toBe(false);
  });

  it('cycles system → light → dark → system, writing the attribute each step', () => {
    const { result } = renderHook(() => useTheme());
    expect(result.current.preference).toBe('system');

    act(() => result.current.cycle());
    expect(result.current.preference).toBe('light');
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    expect(localStorage.getItem(STORAGE_KEY)).toBe('light');

    act(() => result.current.cycle());
    expect(result.current.preference).toBe('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(localStorage.getItem(STORAGE_KEY)).toBe('dark');

    act(() => result.current.cycle());
    expect(result.current.preference).toBe('system');
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false);
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });
});
