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
  // `total` is the server's count of this company's vacancies, not the size of the
  // page it sent (the company filter is a substring match, so it can count more
  // than the table shows). The subtitle said "in the log" off `items.length`, so a
  // 250-vacancy company read "100 in the log" under a button saying 249.
  const total = data?.total ?? 0;

  // One gate for both claims this row makes about the log: nothing is known until
  // the tracker's own query has loaded, and on failure it is not "empty" — it never
  // arrived. Without `isError`, a stopped API painted every row "Not applied".
  const logUnknown = applications.isPending || applications.isError;

  return (
    <Modal onClose={onClose} labelledBy={titleId} maxWidthClassName="max-w-2xl">
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

      {applications.isError && (
        <p className="mt-[6px] text-[12.5px] text-bad">
          Couldn’t load your applications, so the Action column is hidden.
        </p>
      )}

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
                // Two independent questions, and they used to be one variable: can
                // this be a link (`isSafeExternalUrl`), and can a score be shown
                // (`hasAnalysis`). A row can be either without the other — which is
                // why /vacancies and this table drew the same row differently.
                const linkable = isSafeExternalUrl(item.applyUrl);
                const isCurrent = item.id === currentId;
                return (
                  <tr key={item.id} className={isCurrent ? 'row-current' : undefined}>
                    <td className="date-cell">
                      {!logUnknown && application && isTimedOut(application) && (
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
                    {/* A placeholder has no analysis behind its score number. */}
                    <td>{item.hasAnalysis ? <ScorePill score={item.matchScore} /> : '—'}</td>
                    {/* Nothing until the log has loaded, and nothing if it never
                        did — "Not applied" is a claim, wrong for one round-trip and
                        false for a failed request. */}
                    <td className="text-[12.5px]">
                      {logUnknown ? '—' : application ? 'Applied' : 'Not applied'}
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
