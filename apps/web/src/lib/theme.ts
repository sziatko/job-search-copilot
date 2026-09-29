import { useCallback, useState } from 'react';

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

export function useTheme() {
  const [stored, setStored] = useState<Theme | null>(getStoredTheme);
  /** The theme on screen. */
  const theme = stored ?? osTheme();

  const toggle = useCallback(() => {
    // Read the OS now, not at render: it may have flipped under an open tab.
    const next: Theme = (stored ?? osTheme()) === 'dark' ? 'light' : 'dark';
    // The attribute first, so the paint and the stored value can't disagree.
    document.documentElement.setAttribute('data-theme', next);
    setStoredTheme(next);
    setStored(next);
  }, [stored]);

  return { theme, stored, toggle };
}
