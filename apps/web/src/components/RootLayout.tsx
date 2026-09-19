import { Outlet, useMatches, useRouterState } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { Sidebar } from './shell/Sidebar';
import { Topbar } from './shell/Topbar';

/**
 * The app shell: fixed sidebar + sticky topbar, with each page rendering into
 * the outlet as a `.view`.
 */
export function RootLayout() {
  const matches = useMatches();
  const meta = matches.at(-1)?.staticData ?? {};
  const pathname = useRouterState({ select: (state) => state.location.pathname });

  // Manual rail toggle, tagged with the path it was made on. Navigation changes
  // the path, so the override stops applying on its own — no effect that would
  // paint one frame with the previous route's state.
  const [override, setOverride] = useState<{ path: string; value: boolean } | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);

  const collapsed = override?.path === pathname ? override.value : (meta.rail ?? false);

  // The mockup resets scroll on every view switch. These are real routes now, so
  // a scrolled table would otherwise carry its offset into the next page.
  // Not the scroll-restoration option: this router version has none.
  // biome-ignore lint/correctness/useExhaustiveDependencies: pathname is the trigger for the reset, not a value the body reads
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);

  return (
    <div className="app">
      <button
        type="button"
        className={`scrim ${mobileOpen ? 'show' : ''}`}
        onClick={() => setMobileOpen(false)}
        aria-label="Close navigation"
        tabIndex={-1}
      />
      <Sidebar
        collapsed={collapsed}
        mobileOpen={mobileOpen}
        onToggleRail={() => setOverride({ path: pathname, value: !collapsed })}
        onCloseMobile={() => setMobileOpen(false)}
      />
      <div className={`main ${collapsed ? 'rail' : ''}`}>
        <Topbar
          title={meta.title ?? ''}
          subtitle={meta.subtitle ?? ''}
          onOpenMobile={() => setMobileOpen(true)}
        />
        <Outlet />
      </div>
    </div>
  );
}
