import { IconMoon, IconSun } from '@/components/icons';
import { Button } from '@/components/ui/Button';
import { useTheme } from '@/lib/theme';

/** The icon shows the theme on screen; the tooltip names the other one. */
export function ThemeToggle() {
  const { theme, toggle } = useTheme();
  const Icon = theme === 'dark' ? IconMoon : IconSun;
  const next = `Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`;

  return (
    <Button
      variant="icon"
      onClick={toggle}
      aria-label={`${theme === 'dark' ? 'Dark' : 'Light'} theme — ${next}`}
    >
      <Icon />
      {/* The bubble says what a click does; the label also says which theme is on,
          which the icon only shows. */}
      <span className="tip">{next}</span>
    </Button>
  );
}
