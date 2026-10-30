import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useId, useRef, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { DialogActions, DialogSub, DialogTitle } from '@/components/ui/Dialog';
import { EmptyState } from '@/components/ui/EmptyState';
import { Checkbox } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { SearchInput } from '@/components/ui/SearchInput';
import { listApplicationsPage } from '@/lib/applications/api';
import { isPipelineStatus } from '@/lib/applications/types';
import { queryKeys } from '@/lib/queryKeys';
import { listVacanciesPage } from '@/lib/vacancies/api';
import { type VacancyStatus, vacancyStatusSchema } from '@/lib/vacancies/types';
import { countLine, ModalVacancyTable } from './ModalVacancyTable';

/** All with Hide Filtered out on: the whole table but what was screened out. */
const ALL_BUT_FILTERED_OUT = vacancyStatusSchema.exclude(['FILTERED_OUT']).options;

/**
 * A quick look over company and role — "have I seen Acme before?" — with its results
 * here, not in the page's table. **Context** is every status of the page that opened it
 * (`STATUS_CONTEXT`), whatever its status filter shows; **All** is the whole table.
 * Fetched like the company modal: on open, up to 100 rows, `staleTime: 0`.
 */
export function SearchModal({
  context,
  onClose,
}: {
  /** The page's statuses — its `STATUS_CONTEXT`. */
  context: readonly VacancyStatus[];
  onClose: () => void;
}) {
  const titleId = useId();
  const searchRef = useRef<HTMLInputElement>(null);
  const scopeName = useId();
  // The box's raw text (SearchInput debounces it); `term` is what the server is asked.
  const [text, setText] = useState('');
  const term = text.trim();
  const [scope, setScope] = useState<'all' | 'context'>('all');
  const [hideFilteredOut, setHideFilteredOut] = useState(true);

  const statuses =
    scope === 'context'
      ? context
      : hideFilteredOut
        ? ALL_BUT_FILTERED_OUT
        : vacancyStatusSchema.options;

  const { data, isPending, error } = useQuery({
    queryKey: queryKeys.vacancySearch(term, statuses),
    queryFn: () => listVacanciesPage({ search: term, status: statuses, limit: 100 }),
    // An empty box shows nothing, not the whole table.
    enabled: term !== '',
    staleTime: 0,
    // The last results stay while the next term loads, as on the page tables.
    placeholderData: keepPreviousData,
  });

  // The ⏳ mark and the CV column: both endpoints' `search` is company OR title, so the
  // pipeline rows among the results are these applications. Only asked when a pipeline
  // row can be among them.
  // One page of 500: a term matching more applications loses the oldest marks.
  const applications = useQuery({
    queryKey: queryKeys.applicationSearch(term),
    queryFn: () => listApplicationsPage({ search: term, limit: 500 }),
    enabled: term !== '' && statuses.some(isPipelineStatus),
    staleTime: 0,
  });

  const items = data?.items ?? [];

  return (
    <Modal
      onClose={onClose}
      labelledBy={titleId}
      maxWidthClassName="max-w-3xl"
      initialFocus={searchRef}
    >
      <DialogTitle id={titleId}>Search vacancies</DialogTitle>

      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2">
        <SearchInput value={text} onChange={setText} inputRef={searchRef} />
        <fieldset className="flex items-center gap-3">
          <legend className="sr-only">Search in</legend>
          <Checkbox
            type="radio"
            label="All"
            name={scopeName}
            checked={scope === 'all'}
            onChange={() => setScope('all')}
          />
          <Checkbox
            type="radio"
            label="Context"
            name={scopeName}
            checked={scope === 'context'}
            onChange={() => setScope('context')}
          />
        </fieldset>
        {/* Under Context the page decides: /inbox's holds FILTERED_OUT, the others' never do. */}
        <Checkbox
          label="Hide Filtered out"
          checked={hideFilteredOut}
          disabled={scope !== 'all'}
          onChange={(e) => setHideFilteredOut(e.target.checked)}
        />
      </div>

      <DialogSub>
        {term !== '' && isPending
          ? 'Loading…'
          : term !== '' && items.length > 0
            ? countLine(items.length, data?.total ?? 0)
            : 'Matches company or role.'}
      </DialogSub>

      {/* The table's place always holds something — an empty state until there are
          rows, then the table, which grows with them up to its 60vh scroll box — so
          the dialog does not jump from a bare form to a full table. */}
      {term !== '' && error ? (
        <EmptyState>
          Failed to search: {error instanceof Error ? error.message : String(error)}
        </EmptyState>
      ) : term !== '' && (isPending || items.length > 0) ? (
        <ModalVacancyTable
          items={items}
          applications={applications.data?.items}
          loading={isPending}
        />
      ) : (
        <EmptyState>{term === '' ? 'Type a company or role.' : 'No vacancies match.'}</EmptyState>
      )}

      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Modal>
  );
}
