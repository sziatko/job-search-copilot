import { IconMenu } from '@/components/icons';
import { ThemeToggle } from './ThemeToggle';

/**
 * `title` is an <h1> rather than the mockup's <div> — same rendering (preflight
 * inherits font-size/weight, and `.topbar-title` sets both), but keeps a real
 * page heading for screen readers and for the router test.
 */
export function Topbar({ title, onOpenMobile }: { title: string; onOpenMobile: () => void }) {
  return (
    <header className="topbar">
      <div className="flex items-center gap-[12px]">
        <button
          type="button"
          className="menu-toggle"
          onClick={onOpenMobile}
          aria-label="Open navigation"
        >
          <IconMenu />
        </button>
        <h1 className="topbar-title">{title}</h1>
      </div>
      <div className="flex items-center gap-[14px]">
        <ThemeToggle />
      </div>
    </header>
  );
}
