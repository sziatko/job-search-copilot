import type { ReactNode } from 'react';
import { isSafeExternalUrl } from '@/lib/url';
import { IconHistory } from '../icons';
import { Tip } from './Tip';

/** A row's date: the day, with the ⏳ of an application gone quiet and the date of its
 * last move under it. `quietDays` and `updated` come only when the row has them. */
export function DateCell({
  date,
  quietDays,
  updated,
}: {
  date: string;
  quietDays?: number;
  updated?: string;
}) {
  return (
    <div className="whitespace-nowrap text-sm text-ink-soft">
      {quietDays !== undefined && (
        // From the left edge, not centred: the ⏳ leads the first column, where a centred
        // bubble's left half is clipped by the scroll box.
        <span className="relative mr-1 text-warn">
          ⏳<Tip align="start">{quietDays} days since last update</Tip>
        </span>
      )}
      {date}
      {updated && <div className="mt-px text-2xs text-ink-faint">upd: {updated}</div>}
    </div>
  );
}

/** A row's title: a link to the posting, in a new tab, when its URL is one to follow. */
export function RoleTitle({ title, href }: { title: string; href: string }) {
  return isSafeExternalUrl(href) ? (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="text-base font-bold text-ink no-underline hover:text-accent-ink hover:underline"
    >
      {title}
    </a>
  ) : (
    <span className="text-base font-bold text-ink">{title}</span>
  );
}

/** The line under a row's title: company and id, then `children` (the history button). */
export function RoleMeta({
  company,
  id,
  children,
}: {
  company: string;
  id: number;
  children?: ReactNode;
}) {
  return (
    <div className="mt-0.5 text-sm text-ink-muted">
      {company} <span className="text-ink-faint">#{id}</span>
      {children}
    </div>
  );
}

/** Opens the company's other vacancies; none when the row is its company's only one.
 * Shaped for the meta line's text rather than an icon button's 30px square, which would
 * stretch the row and push the line around as it appears. */
export function CompanyHistoryButton({
  company,
  matchCount,
  onClick,
}: {
  company: string;
  /** The company's vacancies, this row included. */
  matchCount: number | undefined;
  onClick: () => void;
}) {
  const others = (matchCount ?? 0) - 1;
  if (others < 1) return null;
  return (
    <button
      type="button"
      onClick={onClick}
      className="relative ml-1.5 inline-flex cursor-pointer items-center gap-0.75 rounded-sm border border-border-strong px-1.25 py-px align-middle text-xs font-bold text-ink-muted hover:border-accent-soft-border hover:bg-accent-soft hover:text-accent-ink [&_svg]:size-2.75"
    >
      <IconHistory />
      {/* The count is decoration and the bubble is the label, so the button does not
          read out "7, 7 other vacancies at contoso". */}
      <span aria-hidden>{others}</span>
      <Tip>
        {others} other {others === 1 ? 'vacancy' : 'vacancies'} at {company}
      </Tip>
    </button>
  );
}

/** Why a row's last write failed, under its controls; nothing when it did not. */
export function RowError({ children }: { children: string | undefined }) {
  return children ? <p className="mt-1 text-xs text-bad">{children}</p> : null;
}
