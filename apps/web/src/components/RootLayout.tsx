import { Outlet, useMatches, useRouterState } from '@tanstack/react-router';
import { useEffect, useRef, useState } from 'react';
import { Sidebar } from './shell/Sidebar';
import { Topbar } from './shell/Topbar';

/**
 * The app shell: fixed sidebar + sticky topbar, with each page rendering into
 * the outlet as a `View`. `data-rail` and `data-compact` are what index.css's `rail`
 * and `compact` variants read.
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

  const mainRef = useRef<HTMLDivElement>(null);

  const collapsed = override?.path === pathname ? override.value : (meta.rail ?? false);

  // Scroll resets on every route change: a scrolled table would otherwise carry its
  // offset into the next page.
  // Not the scroll-restoration option: this router version has none.
  // biome-ignore lint/correctness/useExhaustiveDependencies: pathname is the trigger for the reset, not a value the body reads
  useEffect(() => {
    window.scrollTo(0, 0);
    mainRef.current?.removeAttribute('data-compact');
  }, [pathname]);

  // The header goes compact once anything scrolls — the window or a table's own
  // scroll box. Scroll does not bubble, but a capture listener on the document
  // sees every element's. On past 24px, off only back at 0: the header's own
  // shrink moves the scroll, and one threshold would make it jitter.
  useEffect(() => {
    const onScroll = (event: Event) => {
      const main = mainRef.current;
      if (!main) return;
      const top =
        event.target instanceof Element
          ? event.target.scrollTop
          : (document.scrollingElement?.scrollTop ?? 0);
      if (top > 24) main.setAttribute('data-compact', '');
      else if (top <= 0) main.removeAttribute('data-compact');
    };
    document.addEventListener('scroll', onScroll, { capture: true, passive: true });
    return () => document.removeEventListener('scroll', onScroll, { capture: true });
  }, []);

  return (
    <div className="flex min-h-screen" data-rail={collapsed || undefined}>
      {/* A <button> rather than the mockup's <div>: it is a dismiss control, and a
          click-only div fails the a11y lint. */}
      <button
        type="button"
        className={`hidden border-0 p-0 ${mobileOpen ? 'narrow:fixed narrow:inset-0 narrow:z-30 narrow:block narrow:bg-scrim' : ''}`}
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
      <div
        ref={mainRef}
        // A list page's View fills the window: dvh, as a phone's collapsing URL bar would
        // otherwise leave the page a bar's height to scroll.
        className="ml-61 flex min-w-0 flex-1 flex-col transition-[margin-left] duration-180 has-[>[data-view=fill]]:h-dvh rail:ml-(--rail-w) narrow:ml-0"
      >
        <Topbar title={meta.title ?? ''} onOpenMobile={() => setMobileOpen(true)} />
        <Outlet />
      </div>
    </div>
  );
}
