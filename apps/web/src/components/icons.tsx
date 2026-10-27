/**
 * Every icon in the app, as stroke-based SVGs. `currentColor` throughout, so
 * each one picks up the text colour of its container and therefore the theme.
 *
 * Sizing is left to the consumer: the control an icon sits in sizes its `svg` (an
 * icon `Button`, a nav item).
 *
 * All of these are decorative — the button, link or heading around them carries
 * the label — so the single <svg> below is aria-hidden. That is also why they
 * funnel through one `Icon`: the a11y lint reads attributes literally, so a
 * shared props object spread into a dozen <svg>s is invisible to it.
 *
 * `JscLogo` is the exception on both counts: fixed brand colours, and an image
 * with its own name.
 */
import type { ReactNode, SVGProps } from 'react';
import { isDevServer } from '@/lib/dev-server';

function Icon({ children, ...props }: SVGProps<SVGSVGElement> & { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable={false}
      {...props}
    >
      {children}
    </svg>
  );
}

/** The brand mark. Colours are fixed on purpose: the same look in light and dark themes.
 * Red on the dev server, so the local copy can't pass for production. */
export function JscLogo({ size = 30, className }: { size?: number; className?: string }) {
  const dev = isDevServer();
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      role="img"
      aria-label={dev ? 'Job Search Copilot (dev)' : 'Job Search Copilot'}
      className={className}
    >
      <rect width="48" height="48" rx="12" fill={dev ? '#DC3D3D' : '#2E5CD6'} />
      <path
        d="M11.6 24.9 32.4 15.6 23.1 36.4 20.9 27.1Z"
        fill="#FFFFFF"
        stroke="#FFFFFF"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <circle cx="37" cy="11" r="3.4" fill="#17A874" stroke="#FFFFFF" strokeWidth="2" />
    </svg>
  );
}

export function IconDashboard(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <rect x="3" y="3" width="7" height="9" rx="1.5" />
      <rect x="14" y="3" width="7" height="5" rx="1.5" />
      <rect x="14" y="12" width="7" height="9" rx="1.5" />
      <rect x="3" y="16" width="7" height="5" rx="1.5" />
    </Icon>
  );
}

export function IconChecklist(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <path d="M9 6h11M9 12h11M9 18h11" />
      <path d="m4 6 1 1 2-2M4 12l1 1 2-2M4 18l1 1 2-2" />
    </Icon>
  );
}

export function IconSend(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <path d="m3 11 18-8-8 18-2-8-8-2Z" />
    </Icon>
  );
}

export function IconInbox(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <path d="M22 12h-6l-2 3h-4l-2-3H2" />
      <path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11Z" />
    </Icon>
  );
}

export function IconPerson(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c0-4 3.6-7 8-7s8 3 8 7" />
    </Icon>
  );
}

export function IconChevronLeft(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <path d="M15 6l-6 6 6 6" />
      <path d="M8 6v12" />
    </Icon>
  );
}

export function IconMenu(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon width="17" height="17" {...props}>
      <path d="M4 6h16M4 12h16M4 18h16" />
    </Icon>
  );
}

export function IconSun(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4 12H2M22 12h-2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </Icon>
  );
}

export function IconMoon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79Z" />
    </Icon>
  );
}

export function IconBookmark(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <path d="M6.5 4h11v16.5L12 16.5l-5.5 4z" />
    </Icon>
  );
}

export function IconBan(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M6 6l12 12" />
    </Icon>
  );
}

export function IconFilter(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <path d="M3 4h18l-7 8.5V19l-4 2v-8.5L3 4Z" />
    </Icon>
  );
}

export function IconUndo(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <path d="M9 14 4 9l5-5" />
      <path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" />
    </Icon>
  );
}

export function IconHistory(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <path d="M3.5 12a8.5 8.5 0 1 0 2.8-6.3L3 8" />
      <path d="M3 3v5h5" />
      <path d="M12 8v4.5l3 1.8" />
    </Icon>
  );
}

export function IconCheck(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <path d="m4.5 12.5 5 5 10-11" />
    </Icon>
  );
}

export function IconCross(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <path d="M6 6l12 12M18 6 6 18" />
    </Icon>
  );
}

export function IconCopy(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <rect x="9" y="9" width="12" height="12" rx="2" />
      <path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1" />
    </Icon>
  );
}

export function IconEdit(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <path d="M4 20h4L18.5 9.5a2.1 2.1 0 0 0-3-3L5 17v3z" />
      <path d="m13.5 8.5 3 3" />
    </Icon>
  );
}

export function IconArrowRight(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <path d="M5 12h14M13 6l6 6-6 6" />
    </Icon>
  );
}

export function IconExternal(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
      <path d="M15 3h6v6M10 14 21 3" />
    </Icon>
  );
}
