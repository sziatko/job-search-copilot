import { useNavigate, useSearch } from '@tanstack/react-router';
import { useState } from 'react';
import { z } from 'zod';
import { listVacanciesPage } from '../vacancies/api';
import { CompanyHistoryModal } from '../vacancies/components/CompanyHistoryModal';
import { SearchModal } from '../vacancies/components/SearchModal';
import { VacancyTable } from '../vacancies/components/VacancyTable';
import { STATUS_CONTEXT } from '../vacancies/types';
import { useVacancyRows } from '../vacancies/useVacancies';

/** The inbox's tabs, in the URL as `?tab=` — Queue being the absent value. */
export const inboxTabSchema = z.enum(['queue', 'no-text', 'filtered-out']);
type InboxTab = z.infer<typeof inboxTabSchema>;
const INBOX_TAB = inboxTabSchema.enum;

/** The inbox's context: the tabs split it, so there is no status filter and no `ALL`. */
type InboxStatus = z.infer<typeof STATUS_CONTEXT.inbox>;
const STATUS = STATUS_CONTEXT.inbox.enum;

/** What each tab asks the server for (ADR-0033). The analysis queue is NEW with posting
 * text; NEW without it waits for a later intake to bring it; Filtered out is both the
 * analyzer's SKIP and the user's. */
const TABS: Record<
  InboxTab,
  { label: string; status: InboxStatus; hasText?: boolean; empty: string }
> = {
  queue: {
    label: 'Queue',
    status: STATUS.NEW,
    hasText: true,
    empty: 'Nothing is waiting for an analysis.',
  },
  'no-text': {
    label: 'No text',
    status: STATUS.NEW,
    hasText: false,
    empty: 'Every vacancy in the queue has its posting text.',
  },
  'filtered-out': {
    label: 'Filtered out',
    status: STATUS.FILTERED_OUT,
    empty: 'Nothing has been filtered out.',
  },
};

/** `/inbox` — the vacancies before triage: the analysis queue, the ones still without
 * text, and the ones screened out. Newest first, paged by the server (ADR-0030). */
export function InboxPage() {
  const search = useSearch({ from: '/_app/inbox' });
  const navigate = useNavigate({ from: '/inbox' });
  const tab = search.tab ?? INBOX_TAB.queue;
  const { status, hasText, empty } = TABS[tab];

  const { loading, loadError, total, items, loadMore, savingIds, rowErrors, requestActionChange } =
    useVacancyRows(['inbox', tab], (cursor) =>
      listVacanciesPage({ status: [status], hasText, cursor }),
    );

  // Page state, not row state — see VacanciesPage.
  const [companyHistory, setCompanyHistory] = useState<{
    company: string;
    vacancyId: number;
  } | null>(null);
  const [searching, setSearching] = useState(false);

  return (
    <section className="view view-fill">
      <div className="card">
        <div className="toolbar pt-[16px]">
          <fieldset className="tabs">
            <legend className="sr-only">Inbox tab</legend>
            {inboxTabSchema.options.map((value) => (
              <button
                key={value}
                type="button"
                className="tab"
                aria-pressed={value === tab}
                onClick={() =>
                  void navigate({ search: { tab: value === INBOX_TAB.queue ? undefined : value } })
                }
              >
                {TABS[value].label}
              </button>
            ))}
          </fieldset>
          <div className="ml-auto flex items-center gap-[10px]">
            {!loadError && !loading && (
              <span className="toolbar-count">
                Showing {items.length} of {total}
              </span>
            )}
            <button type="button" className="btn" onClick={() => setSearching(true)}>
              Search
            </button>
          </div>
        </div>

        {loadError ? (
          <div className="empty-state">Failed to load the inbox: {loadError}</div>
        ) : !loading && items.length === 0 ? (
          <div className="empty-state">{empty}</div>
        ) : (
          <VacancyTable
            loading={loading}
            items={items}
            onEndReached={loadMore}
            savingIds={savingIds}
            rowErrors={rowErrors}
            onActionChange={requestActionChange}
            onShowCompanyHistory={(company, vacancyId) => setCompanyHistory({ company, vacancyId })}
          />
        )}
      </div>

      {companyHistory && (
        <CompanyHistoryModal
          company={companyHistory.company}
          currentId={companyHistory.vacancyId}
          onClose={() => setCompanyHistory(null)}
        />
      )}

      {searching && (
        <SearchModal context={STATUS_CONTEXT.inbox.options} onClose={() => setSearching(false)} />
      )}
    </section>
  );
}
