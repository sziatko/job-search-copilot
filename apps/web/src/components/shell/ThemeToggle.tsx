import { IconMonitor, IconMoon, IconSun } from '@/components/icons';
import { type ThemePreference, useTheme } from '@/lib/theme';

/** The icon shows the state you are in; the tooltip says what a click does. */
const ICONS = {
  system: IconMonitor,
  light: IconSun,
  dark: IconMoon,
} as const;

const CURRENT = {
  system: 'System theme',
  light: 'Light theme',
  dark: 'Dark theme',
} as const;

const NEXT_LABEL = {
  system: 'Switch to light theme',
  light: 'Switch to dark theme',
  dark: 'Follow the system theme',
} as const;

export function ThemeToggle() {
  const { preference, cycle } = useTheme();
  const Icon = ICONS[preference as ThemePreference];

  return (
    <button
      type="button"
      className="icon-btn"
      onClick={cycle}
      aria-label={`${CURRENT[preference]} — ${NEXT_LABEL[preference]}`}
    >
      <Icon />
      {/* The bubble says what a click does; the label also says which theme is on,
          which the icon only shows. */}
      <span className="tip">{NEXT_LABEL[preference]}</span>
    </button>
  );
}
