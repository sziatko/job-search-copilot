import { useCallback, useState } from 'react';

/**
 * Three states, not two:
 *   'system' — no data-theme attribute; index.css's prefers-color-scheme block
 *              decides. This is the default and the only state that follows the
 *              OS live.
 *   'light' / 'dark' — an explicit attribute pinning the theme.
 *
 * The attribute is the whole mechanism; the stored value just remembers which
 * one to write. The no-flash boot script in index.html reads the same key.
 */
export type ThemePreference = 'system' | 'light' | 'dark';

const STORAGE_KEY = 'jsc-theme';
export function getStoredPreference(): ThemePreference {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw === 'light' || raw === 'dark' ? raw : 'system';
  } catch {
    return 'system';
  }
}

export function applyPreference(preference: ThemePreference): void {
  const root = document.documentElement;
  if (preference === 'system') {
    root.removeAttribute('data-theme');
  } else {
    root.setAttribute('data-theme', preference);
  }
}

export function setStoredPreference(preference: ThemePreference): void {
  try {
    if (preference === 'system') {
      localStorage.removeItem(STORAGE_KEY);
    } else {
      localStorage.setItem(STORAGE_KEY, preference);
    }
  } catch {
    /* storage disabled — the choice just won't survive a reload */
  }
}

const NEXT: Record<ThemePreference, ThemePreference> = {
  system: 'light',
  light: 'dark',
  dark: 'system',
};

export function useTheme() {
  const [preference, setPreference] = useState<ThemePreference>(getStoredPreference);

  const cycle = useCallback(() => {
    const next = NEXT[preference];
    // The attribute first, so the paint and the stored value can't disagree.
    applyPreference(next);
    setStoredPreference(next);
    setPreference(next);
  }, [preference]);

  return { preference, cycle };
}
