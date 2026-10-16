import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useId, useRef, useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { SearchInput } from '@/components/ui/SearchInput';
import { listApplicationsPage } from '@/pages/applications/api';
import { isPipelineStatus } from '@/pages/applications/types';
import { listVacanciesPage } from '../api';
import { type VacancyStatus, vacancyStatusSchema } from '../types';
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
    // Not under ['vacancies'], as the company modal's: the tables' writes invalidate that.
    queryKey: ['vacancy-search', term, statuses],
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
    queryKey: ['application-search', term],
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
      <h2 id={titleId} className="dialog-title">
        Search vacancies
      </h2>

      <div className="mt-[14px] flex flex-wrap items-center gap-x-[16px] gap-y-[10px]">
        <SearchInput value={text} onChange={setText} inputRef={searchRef} />
        <fieldset className="flex items-center gap-[12px]">
          <legend className="sr-only">Search in</legend>
          <label className="field-check">
            <input
              type="radio"
              name={scopeName}
              checked={scope === 'all'}
              onChange={() => setScope('all')}
              className="h-4 w-4 accent-[var(--color-accent)]"
            />
            All
          </label>
          <label className="field-check">
            <input
              type="radio"
              name={scopeName}
              checked={scope === 'context'}
              onChange={() => setScope('context')}
              className="h-4 w-4 accent-[var(--color-accent)]"
            />
            Context
          </label>
        </fieldset>
        {/* Under Context the page decides: /inbox's holds FILTERED_OUT, the others' never do. */}
        <label className="field-check has-[:disabled]:opacity-50">
          <input
            type="checkbox"
            checked={hideFilteredOut}
            disabled={scope !== 'all'}
            onChange={(e) => setHideFilteredOut(e.target.checked)}
            className="h-4 w-4 accent-[var(--color-accent)]"
          />
          Hide Filtered out
        </label>
      </div>

      <p className="dialog-sub">
        {term !== '' && isPending
          ? 'Loading…'
          : term !== '' && items.length > 0
            ? countLine(items.length, data?.total ?? 0)
            : 'Matches company or role.'}
      </p>

      {/* The table's place always holds something — an empty state until there are
          rows, then the table, which grows with them up to its 60vh scroll box — so
          the dialog does not jump from a bare form to a full table. */}
      {term !== '' && error ? (
        <div className="empty-state">
          Failed to search: {error instanceof Error ? error.message : String(error)}
        </div>
      ) : term !== '' && (isPending || items.length > 0) ? (
        <ModalVacancyTable
          items={items}
          applications={applications.data?.items}
          loading={isPending}
        />
      ) : (
        <div className="empty-state">
          {term === '' ? 'Type a company or role.' : 'No vacancies match.'}
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
