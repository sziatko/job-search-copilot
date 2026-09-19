import { Link } from '@tanstack/react-router';
import type { ComponentType, SVGProps } from 'react';
import {
  IconBriefcase,
  IconChecklist,
  IconChevronLeft,
  IconDashboard,
  IconLayers,
  IconPerson,
  IconSend,
} from '@/components/icons';

interface NavItem {
  to: string;
  label: string;
  title: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  /** Only the index route needs this — without it "/" prefix-matches everything. */
  exact?: boolean;
  badge?: string;
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
        to: '/tracker',
        label: 'Application tracker',
        title: 'Application tracker',
        icon: IconSend,
      },
      { to: '/log', label: 'Vacancy log', title: 'Vacancy log', icon: IconLayers },
    ],
  },
  {
    label: 'Account',
    items: [
      {
        to: '/profile',
        label: 'Profile & forms',
        title: 'Profile & forms — soon',
        icon: IconPerson,
        badge: 'SOON',
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
  return (
    <aside className={`sidebar ${collapsed ? 'collapsed' : ''} ${mobileOpen ? 'open' : ''}`}>
      <div className="brand">
        <div className="brand-mark">
          <IconBriefcase />
        </div>
        <div className="brand-text">
          <div className="brand-name">Job Search Copilot</div>
        </div>
      </div>

      <button
        type="button"
        className="rail-toggle"
        onClick={onToggleRail}
        title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
      >
        <IconChevronLeft />
        <span className="rail-toggle-text">{collapsed ? 'Expand' : 'Collapse'}</span>
      </button>

      <nav className="nav">
        {NAV_SECTIONS.map((section) => (
          <div key={section.label}>
            <div className="nav-label">{section.label}</div>
            {section.items.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                title={item.title}
                className={`nav-item ${item.badge === 'SOON' ? 'disabled' : ''}`}
                activeProps={{ className: 'active' }}
                activeOptions={item.exact ? { exact: true } : undefined}
                onClick={onCloseMobile}
              >
                <item.icon />
                <span className="nav-text">{item.label}</span>
                {item.badge && <span className="soon-pill">{item.badge}</span>}
              </Link>
            ))}
          </div>
        ))}
      </nav>

      <div className="sidebar-foot">
        <div className="avatar">SZ</div>
        <div className="foot-text">
          <div className="foot-name">User</div>
          <div className="foot-role">Senior Frontend / TL</div>
        </div>
      </div>
    </aside>
  );
}
