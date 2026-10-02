import { useQuery } from '@tanstack/react-query';
import { useId, useRef } from 'react';
import { DetailsLink } from '@/components/ui/DetailsLink';
import { Modal } from '@/components/ui/Modal';
import { ScorePill } from '@/components/ui/ScorePill';
import { SkeletonRows } from '@/components/ui/SkeletonRows';
import { isSafeExternalUrl } from '@/lib/url';
import { listApplicationsPage } from '@/pages/applications/api';
import { daysSinceLastMove } from '@/pages/applications/constants';
import { listVacanciesPage } from '../api';
import { STATUS_TAGS } from '../constants';
import { CopyVacancyButton } from './CopyVacancyButton';

const dateFormatter = new Intl.DateTimeFormat('en-US', { day: 'numeric', month: 'short' });

/**
 * Every vacancy of one company with its status — the answer to "have I dealt with
 * these people before?" without leaving the triage screen.
 *
 * Fetched when it opens, not with the table: the list only needs
 * `companyMatchCount` to draw the button, and the modal's rows are a different
 * query (a different scope, and up to 100 of them). `staleTime: 0` on both
 * queries, so every open refetches: neither key is invalidated by the tables'
 * writes, and the app's default 30s kept a status changed a moment ago stale.
 */
export function CompanyHistoryModal({
  company,
  currentId,
  onClose,
}: {
  company: string;
  /** The vacancy whose row opened this — the row to point at once it is listed. */
  currentId: number;
  onClose: () => void;
}) {
  const titleId = useId();
  // Once per open, not on every render: a refetch re-renders the row, and pulling
  // the list back to it would undo the user's own scrolling.
  const scrolledToCurrent = useRef(false);
  const scrollToCurrent = (row: HTMLTableRowElement | null) => {
    if (!row || scrolledToCurrent.current) return;
    scrolledToCurrent.current = true;
    row.scrollIntoView({ block: 'nearest' });
  };

  const { data, isPending, error } = useQuery({
    // Deliberately NOT under ['vacancies']: useVacancies invalidates that prefix
    // after every action change, which would refetch this for nothing.
    queryKey: ['vacancy-company', company],
    queryFn: () => listVacanciesPage({ sameCompanyAs: company, limit: 100 }),
    staleTime: 0,
  });

  // This company's applications, every spelling (ADR-0032), for the ⏳ mark and the
  // CV column — joined by id below. Not under ['applications']:
  // those entries are the tracker's paged lists, and its optimistic writes patch
  // every one of them as pages.
  // ponytail: one page of 500; a company with more applications loses the oldest marks.
  const applications = useQuery({
    queryKey: ['application-company', company],
    queryFn: () => listApplicationsPage({ sameCompanyAs: company, limit: 500 }),
    staleTime: 0,
  });

  const applicationsByVacancy = new Map(
    (applications.data?.items ?? []).map((item) => [item.id, item]),
  );
  const items = data?.items ?? [];
  // `total` is the server's count of this company's vacancies, not the size of the
  // page it sent (100 at most). The subtitle said "in the log" off `items.length`, so
  // a 250-vacancy company read "100 in the log" under a button saying 249.
  const total = data?.total ?? 0;

  return (
    <Modal onClose={onClose} labelledBy={titleId} maxWidthClassName="max-w-3xl">
      <h2 id={titleId} className="dialog-title">
        All vacancies at {company}
      </h2>
      <p className="dialog-sub">
        {isPending
          ? 'Loading…'
          : items.length < total
            ? `Showing ${items.length} of ${total} vacancies, newest first`
            : `${total} vacancies, newest first`}
      </p>

      {error ? (
        <div className="empty-state">
          Failed to load this company: {error instanceof Error ? error.message : String(error)}
        </div>
      ) : (
        // A big company's history is longer than the viewport, and `body` is
        // `overflow: hidden` behind the dialog, so the dialog itself has to
        // scroll. 60vh leaves the title and the Close button on screen.
        <div className="max-h-[60vh] overflow-y-auto">
          {/* `min-w-0` overrides the global `table { min-width: 760px }`, which
              would burst the dialog's own width. */}
          <table className="min-w-0" aria-busy={isPending}>
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
              {isPending && <SkeletonRows rows={4} cols={6} />}
              {items.map((item) => {
                const application = applicationsByVacancy.get(item.id);
                // Two independent questions, and they used to be one variable: can
                // this be a link (`isSafeExternalUrl`), and can a score be shown
                // (`hasAnalysis`). A row can be either without the other — which is
                // why /vacancies and this table drew the same row differently.
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
                      {isCurrent && (
                        <span className="tag accent ml-[7px] align-middle">Current</span>
                      )}
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
      )}

      <div className="dialog-actions">
        <button type="button" className="btn" onClick={onClose}>
          Close
        </button>
      </div>
    </Modal>
  );
}
