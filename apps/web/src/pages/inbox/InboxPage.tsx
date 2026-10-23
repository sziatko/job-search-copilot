import { useNavigate, useSearch } from '@tanstack/react-router';
import { useState } from 'react';
import { z } from 'zod';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { ListCount, ListFrame } from '@/components/ui/ListFrame';
import { Tabs } from '@/components/ui/Tabs';
import { View } from '@/components/ui/View';
import { CompanyHistoryModal } from '@/components/vacancies/CompanyHistoryModal';
import { SearchModal } from '@/components/vacancies/SearchModal';
import { VacancyTable } from '@/components/vacancies/VacancyTable';
import { listVacanciesPage } from '@/lib/vacancies/api';
import { STATUS_CONTEXT } from '@/lib/vacancies/types';
import { useVacancyRows } from '@/lib/vacancies/useVacancyRows';

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

const TAB_OPTIONS = inboxTabSchema.options.map((value) => ({ value, label: TABS[value].label }));

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
    <View fill>
      <ListFrame
        toolbar={
          <>
            <Tabs
              legend="Inbox tab"
              options={TAB_OPTIONS}
              value={tab}
              onChange={(value) =>
                void navigate({ search: { tab: value === INBOX_TAB.queue ? undefined : value } })
              }
            />
            <div className="ml-auto flex items-center gap-2.5">
              {!loadError && !loading && <ListCount shown={items.length} total={total} />}
              <Button onClick={() => setSearching(true)}>Search</Button>
            </div>
          </>
        }
      >
        {loadError ? (
          <EmptyState>Failed to load the inbox: {loadError}</EmptyState>
        ) : !loading && items.length === 0 ? (
          <EmptyState>{empty}</EmptyState>
        ) : (
          <VacancyTable
            loading={loading}
            items={items}
            onEndReached={loadMore}
            filterKey={tab}
            savingIds={savingIds}
            rowErrors={rowErrors}
            onActionChange={requestActionChange}
            onShowCompanyHistory={(company, vacancyId) => setCompanyHistory({ company, vacancyId })}
          />
        )}
      </ListFrame>

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
    </View>
  );
}
