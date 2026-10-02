import { useSyncExternalStore } from 'react';

/**
 * Two themes, and the OS picks the first:
 *   nothing stored — no data-theme attribute; index.css's prefers-color-scheme
 *                    block decides, and follows the OS live.
 *   'light' / 'dark' — stored after the first click, pinned by the attribute.
 * There is no way back to "follow the OS" but clearing storage.
 *
 * The attribute is the whole mechanism; the stored value just remembers which
 * one to write. The no-flash boot script in index.html reads the same key.
 */
export type Theme = 'light' | 'dark';

const STORAGE_KEY = 'jsc-theme';
export function getStoredTheme(): Theme | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw === 'light' || raw === 'dark' ? raw : null;
  } catch {
    return null;
  }
}

export function setStoredTheme(theme: Theme): void {
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    /* storage disabled — the choice just won't survive a reload */
  }
}

function osTheme(): Theme {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

/**
 * One copy for the whole app, read once at load. Each `useTheme` used to hold its
 * own `useState`, so the toaster kept the old theme after a click on the toggle
 * until a reload. Kept in memory, not re-read from storage, so a click still
 * works for the session when storage is disabled.
 */
let stored: Theme | null = getStoredTheme();
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot() {
  return stored;
}

function toggle() {
  // Read the OS now, not at render: it may have flipped under an open tab.
  const next: Theme = (stored ?? osTheme()) === 'dark' ? 'light' : 'dark';
  // The attribute first, so the paint and the stored value can't disagree.
  document.documentElement.setAttribute('data-theme', next);
  setStoredTheme(next);
  stored = next;
  for (const listener of listeners) listener();
}

export function useTheme() {
  const current = useSyncExternalStore(subscribe, getSnapshot);
  /** `theme` is the one on screen. */
  return { theme: current ?? osTheme(), stored: current, toggle };
}
