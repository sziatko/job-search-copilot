import { Link, useRouteContext } from '@tanstack/react-router';
import type { ComponentType, SVGProps } from 'react';
import {
  IconChecklist,
  IconChevronLeft,
  IconDashboard,
  IconInbox,
  IconPerson,
  IconSend,
  JscLogo,
} from '@/components/icons';

interface NavItem {
  to: string;
  label: string;
  title: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  /** Only the index route needs this — without it "/" prefix-matches everything. */
  exact?: boolean;
}

const NAV_SECTIONS: { label: string; items: NavItem[] }[] = [
  {
    label: 'Overview',
    items: [{ to: '/', label: 'Dashboard', title: 'Dashboard', icon: IconDashboard, exact: true }],
  },
  {
    label: 'Pipeline',
    items: [
      {
        to: '/vacancies',
        label: 'Analyzed vacancies',
        title: 'Analyzed vacancies',
        icon: IconChecklist,
      },
      {
        to: '/applications',
        label: 'Application tracker',
        title: 'Application tracker',
        icon: IconSend,
      },
      { to: '/inbox', label: 'Inbox', title: 'Inbox', icon: IconInbox },
    ],
  },
  {
    label: 'Account',
    items: [
      {
        to: '/profile',
        label: 'Profile & forms',
        title: 'Profile & forms',
        icon: IconPerson,
      },
    ],
  },
];

export function Sidebar({
  collapsed,
  mobileOpen,
  onToggleRail,
  onCloseMobile,
}: {
  collapsed: boolean;
  mobileOpen: boolean;
  onToggleRail: () => void;
  onCloseMobile: () => void;
}) {
  // The signed-in user, from the shell's session guard (router.tsx).
  const { user } = useRouteContext({ from: '/_app' });
  const name = user.name || user.email;
  const initials = name
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase())
    .join('');

  return (
    <aside
      className={`fixed inset-y-0 left-0 z-40 flex w-sidebar flex-none flex-col gap-4 overflow-y-auto overflow-x-hidden border-r border-border bg-surface px-4 py-4 transition-[width,translate] rail:w-rail rail:px-2 narrow:shadow-pop ${mobileOpen ? '' : 'narrow:-translate-x-full'}`}
    >
      <div className="flex items-center gap-2 px-2 py-1 rail:justify-center rail:px-0">
        <JscLogo className="flex-none" />
        <div className="text-title leading-4 rail:hidden">Job Search Copilot</div>
      </div>

      <button
        type="button"
        className="flex w-full cursor-pointer items-center gap-2 rounded-md border border-border bg-surface-alt px-2 py-2 text-small font-bold text-ink-muted hover:border-border-strong hover:text-ink rail:justify-center narrow:hidden"
        onClick={onToggleRail}
        title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
      >
        <IconChevronLeft className="size-4 flex-none transition-[rotate] rail:rotate-180" />
        <span className="rail:hidden">{collapsed ? 'Expand' : 'Collapse'}</span>
      </button>

      <nav className="flex flex-col gap-1">
        {NAV_SECTIONS.map((section) => (
          <div key={section.label}>
            <div className="px-2 pt-2 pb-1 text-overline uppercase text-ink-faint rail:hidden">
              {section.label}
            </div>
            {section.items.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                title={item.title}
                // The router marks the current page's link `data-status="active"`.
                className="group flex w-full cursor-pointer items-center gap-2 rounded-md border border-transparent bg-transparent px-2 py-2 text-left text-body font-semibold text-ink-soft no-underline hover:bg-surface-alt hover:text-ink data-[status=active]:border-accent-soft-border data-[status=active]:bg-accent-soft data-[status=active]:text-accent-ink rail:justify-center rail:px-0 rail:py-2"
                activeOptions={item.exact ? { exact: true } : undefined}
                onClick={onCloseMobile}
              >
                <item.icon className="size-4 flex-none opacity-80 group-data-[status=active]:opacity-100 rail:opacity-100" />
                <span className="rail:hidden">{item.label}</span>
              </Link>
            ))}
          </div>
        ))}
      </nav>

      <div className="mt-auto flex items-center gap-2 border-t border-border px-2 pt-2 pb-1 rail:justify-center rail:px-0">
        <div className="flex size-7 flex-none items-center justify-center rounded-full border border-border bg-surface-sunken text-caption font-bold text-ink-muted">
          {initials}
        </div>
        <div className="text-small font-bold leading-3.5 rail:hidden">{name}</div>
      </div>
    </aside>
  );
}
