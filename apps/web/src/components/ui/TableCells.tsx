import type { ReactNode } from 'react';
import { isSafeExternalUrl } from '@/lib/url';
import { IconHistory, IconPlus } from '../icons';
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
    <div className="whitespace-nowrap text-small text-ink-soft">
      {quietDays !== undefined && (
        // From the left edge, not centred: the ⏳ leads the first column, where a centred
        // bubble's left half is clipped by the scroll box.
        <span className="relative mr-1 text-warn">
          ⏳<Tip align="start">{quietDays} days since last update</Tip>
        </span>
      )}
      {date}
      {updated && <div className="mt-px text-caption text-ink-faint">upd: {updated}</div>}
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
      className="text-body font-bold text-ink no-underline hover:text-accent-ink hover:underline"
    >
      {title}
    </a>
  ) : (
    <span className="text-body font-bold text-ink">{title}</span>
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
    <div className="text-small text-ink-muted">
      {company} <span className="text-ink-faint">#{id}</span>
      {children}
    </div>
  );
}

/** A button on the meta line, shaped for its text rather than an icon button's 30px square,
 * which would stretch the row and push the line around as it appears. */
const META_BUTTON =
  'relative ml-2 inline-flex cursor-pointer items-center gap-1 rounded-sm border border-border-strong px-1 py-px align-middle text-caption font-bold text-ink-muted hover:border-accent-soft-border hover:bg-accent-soft hover:text-accent-ink aria-disabled:opacity-50 [&_svg]:size-3';

/** Opens the company's other vacancies; none when the row is its company's only one. */
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
    <button type="button" onClick={onClick} className={META_BUTTON}>
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

/** Opens the dialog that adds a tag. `aria-disabled` while the vacancy saves, not `disabled`:
 * the write starts as the dialog closes, and focus cannot return to a disabled button. */
export function AddTagButton({ saving, onClick }: { saving: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-disabled={saving}
      onClick={saving ? undefined : onClick}
      className={META_BUTTON}
    >
      <IconPlus />
      <Tip>Add tag</Tip>
    </button>
  );
}

/** The `CV / CL` column: whether a tailored resume and a cover letter went with the
 * application, `✓ / —`. Both unset on a row never applied to. */
export function ApplyFlagsCell({
  resume,
  letter,
}: {
  resume: boolean | undefined;
  letter: boolean | undefined;
}) {
  const mark = (on: boolean | undefined) => (on ? '✓' : '—');
  return (
    <div className="whitespace-nowrap text-small text-ink-muted">
      {mark(resume)} / {mark(letter)}
    </div>
  );
}

/** Why a row's last write failed, under its controls; nothing when it did not. */
export function RowError({ children }: { children: string | undefined }) {
  return children ? <p className="mt-1 text-caption text-bad-ink">{children}</p> : null;
}
