import { useRef } from 'react';
import { DetailsLink } from '@/components/ui/DetailsLink';
import { ScorePill } from '@/components/ui/ScorePill';
import { SkeletonRows } from '@/components/ui/SkeletonRows';
import { isSafeExternalUrl } from '@/lib/url';
import { daysSinceLastMove } from '@/pages/applications/constants';
import type { ApplicationListItem } from '@/pages/applications/types';
import { STATUS_TAGS } from '../constants';
import type { VacancyListItem } from '../types';
import { CopyVacancyButton } from './CopyVacancyButton';

const dateFormatter = new Intl.DateTimeFormat('en-US', { day: 'numeric', month: 'short' });

/** A modal's subtitle over one capped page: `total` is the server's count of the
 * matches, not the size of the page it sent. */
export function countLine(shown: number, total: number) {
  return shown < total
    ? `Showing ${shown} of ${total} vacancies, newest first`
    : `${total} vacancies, newest first`;
}

/**
 * The vacancy rows of a modal — the company modal's and the search modal's: date (with
 * the tracker's ⏳), vacancy, score, status, CV, Copy / Details (in a new tab: a modal's
 * context would be lost to an in-place navigation).
 */
export function ModalVacancyTable({
  items,
  applications,
  loading,
  currentId,
}: {
  items: readonly VacancyListItem[];
  /** The pipeline rows among `items`, for the ⏳ mark and the CV column — joined by id. */
  applications: readonly ApplicationListItem[] | undefined;
  loading: boolean;
  /** The row to mark Current and scroll to — the one whose button opened the modal. */
  currentId?: number;
}) {
  // Once per open, not on every render: a refetch re-renders the row, and pulling
  // the list back to it would undo the user's own scrolling.
  const scrolledToCurrent = useRef(false);
  const scrollToCurrent = (row: HTMLTableRowElement | null) => {
    if (!row || scrolledToCurrent.current) return;
    scrolledToCurrent.current = true;
    row.scrollIntoView({ block: 'nearest' });
  };

  const applicationsByVacancy = new Map((applications ?? []).map((item) => [item.id, item]));

  return (
    // A long list is longer than the viewport, and `body` is `overflow: hidden`
    // behind the dialog, so the dialog itself has to scroll. 60vh leaves the title
    // and the Close button on screen.
    <div className="max-h-[60vh] overflow-y-auto">
      {/* `min-w-0` overrides the global `table { min-width: 760px }`, which
          would burst the dialog's own width. */}
      <table className="min-w-0" aria-busy={loading}>
        <thead>
          <tr>
            <th>Date</th>
            <th>Vacancy</th>
            <th>Score</th>
            <th>Status</th>
            <th>CV</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {loading && <SkeletonRows rows={4} cols={6} />}
          {items.map((item) => {
            const application = applicationsByVacancy.get(item.id);
            // Two independent questions: can this be a link (`isSafeExternalUrl`), and
            // can a score be shown (`hasAnalysis`). A row can be either without the
            // other.
            const linkable = isSafeExternalUrl(item.applyUrl);
            const isCurrent = item.id === currentId;
            return (
              <tr
                key={item.id}
                ref={isCurrent ? scrollToCurrent : undefined}
                className={isCurrent ? 'row-current' : undefined}
              >
                <td className="date-cell">
                  {application?.timedOut && (
                    <span className="timeout-mark mr-[4px]">
                      ⏳
                      <span className="tip">
                        {daysSinceLastMove(application)} days since last update
                      </span>
                    </span>
                  )}
                  {dateFormatter.format(new Date(item.createdAt))}
                </td>
                <td>
                  {linkable ? (
                    <a
                      href={item.applyUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="role-title role-link"
                    >
                      {item.title}
                    </a>
                  ) : (
                    <span className="role-title">{item.title}</span>
                  )}
                  {/* Which of these rows is the one you clicked — a sibling
                      can carry another spelling of the company. */}
                  {isCurrent && <span className="tag accent ml-[7px] align-middle">Current</span>}
                  <div className="role-meta">
                    {item.company} <span className="id">#{item.id}</span>
                  </div>
                </td>
                {/* A placeholder has no analysis behind its score number. */}
                <td>{item.hasAnalysis ? <ScorePill score={item.matchScore} /> : '—'}</td>
                <td>
                  <span className={`tag ${STATUS_TAGS[item.status].variant}`}>
                    {STATUS_TAGS[item.status].text}
                  </span>
                </td>
                {/* /applications' CV column; a row never applied to has no CV. */}
                <td className="text-[12px] text-ink-muted">
                  {application?.usedTailoredResume ? '✓' : '—'}
                </td>
                <td>
                  <div className="flex gap-[6px]">
                    <CopyVacancyButton
                      id={item.id}
                      company={item.company}
                      title={item.title}
                      applyUrl={item.applyUrl}
                    />
                    <DetailsLink id={item.id} newTab />
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
