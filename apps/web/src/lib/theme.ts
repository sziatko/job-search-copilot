import { useCallback, useState, useSyncExternalStore } from 'react';

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
const DARK_QUERY = '(prefers-color-scheme: dark)';

function darkQuery(): MediaQueryList | null {
  // jsdom has no matchMedia; neither does a browser with it disabled.
  return typeof window !== 'undefined' && window.matchMedia ? window.matchMedia(DARK_QUERY) : null;
}

export function systemPrefersDark(): boolean {
  return darkQuery()?.matches ?? false;
}

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

  // Subscribed unconditionally and not just in 'system' mode: it keeps the
  // topbar icon honest when the OS theme flips under an open tab. CSS would
  // repaint either way, but React wouldn't know.
  const systemDark = useSyncExternalStore(
    (onChange) => {
      const query = darkQuery();
      query?.addEventListener('change', onChange);
      return () => query?.removeEventListener('change', onChange);
    },
    systemPrefersDark,
    () => false,
  );

  const cycle = useCallback(() => {
    const next = NEXT[preference];
    // The attribute first, so the paint and the stored value can't disagree.
    applyPreference(next);
    setStoredPreference(next);
    setPreference(next);
  }, [preference]);

  return {
    preference,
    isDark: preference === 'dark' || (preference === 'system' && systemDark),
    cycle,
  };
}
