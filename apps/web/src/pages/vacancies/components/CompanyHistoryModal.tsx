import { useQuery } from '@tanstack/react-query';
import { useId } from 'react';
import { Modal } from '@/components/ui/Modal';
import { ScorePill } from '@/components/ui/ScorePill';
import { isSafeExternalUrl } from '@/lib/url';
import { listApplications } from '@/pages/applications/api';
import { daysSinceLastMove, isTimedOut } from '@/pages/applications/constants';
import { listEstimatedVacanciesPage } from '../api';

const dateFormatter = new Intl.DateTimeFormat('en-US', { day: 'numeric', month: 'short' });

/**
 * Every vacancy of one company, joined against the tracker's log to say which of
 * them were applied to — the answer to "have I dealt with these people before?"
 * without leaving the triage screen.
 *
 * Fetched when it opens, not with the table: the list only needs
 * `companyMatchCount` to draw the button, and the modal's rows are a different
 * query (a different scope, and up to 100 of them).
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

  const { data, isPending, error } = useQuery({
    // Deliberately NOT under ['vacancies']: useVacancies invalidates that prefix
    // after every action change, which would refetch this for nothing.
    queryKey: ['vacancy-company', company],
    queryFn: () => listEstimatedVacanciesPage({ company, limit: 100 }),
  });

  // The tracker's own key, so arriving here from /tracker costs no request.
  const applications = useQuery({ queryKey: ['applications'], queryFn: listApplications });

  const applicationsByVacancy = new Map(
    (applications.data?.items ?? []).map((item) => [item.estimatedVacancyId, item]),
  );
  const items = data?.items ?? [];

  return (
    <Modal onClose={onClose} labelledBy={titleId} maxWidthClassName="max-w-2xl">
      <h2 id={titleId} className="dialog-title">
        All vacancies at {company}
      </h2>
      <p className="dialog-sub">
        {isPending ? 'Loading…' : `${items.length} in the log, newest first`}
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
          <table className="min-w-0">
            <thead>
              <tr>
                <th>Date</th>
                <th>Vacancy</th>
                <th>Score</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => {
                const application = applicationsByVacancy.get(item.id);
                const linkable = isSafeExternalUrl(item.applyUrl);
                const isCurrent = item.id === currentId;
                return (
                  <tr key={item.id} className={isCurrent ? 'row-current' : undefined}>
                    <td className="date-cell">
                      {application && isTimedOut(application) && (
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
                      {/* Which of these rows is the one you clicked — the company
                          filter matches substrings, so a sibling here can be a
                          different company too. */}
                      {isCurrent && (
                        <span className="tag accent ml-[7px] align-middle">Current</span>
                      )}
                      <div className="role-meta">
                        {item.company} <span className="id">#{item.id}</span>
                      </div>
                    </td>
                    {/* An importer placeholder has no posting behind it, so its
                        score would be a fabricated 0%. */}
                    <td>{linkable ? <ScorePill score={item.matchScore} /> : '—'}</td>
                    {/* Nothing until the log has loaded — "Not applied" is a claim,
                        and it would be wrong for one round-trip. */}
                    <td className="text-[12.5px]">
                      {applications.isPending ? '—' : application ? 'Applied' : 'Not applied'}
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
