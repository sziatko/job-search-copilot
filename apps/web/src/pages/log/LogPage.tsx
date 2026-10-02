import { useNavigate, useSearch } from '@tanstack/react-router';
import { useRef } from 'react';
import { SearchInput } from '@/components/ui/SearchInput';
import { SkeletonRows } from '@/components/ui/SkeletonRows';
import { useVirtualRows } from '@/components/useVirtualRows';
import { isSafeExternalUrl } from '@/lib/url';
import { useInfiniteList } from '@/lib/useInfiniteList';
import { listLogPage } from './api';
import type { LogEntry } from './types';

const dateFormatter = new Intl.DateTimeFormat('en-US', {
  day: 'numeric',
  month: 'short',
  year: '2-digit',
});

const COL_COUNT = 4;

/** Every posting the pipeline has seen (ADR-0026), searched and paged by the server
 * (ADR-0030). Read-only: the log is written by check-and-record, never by hand. */
export function LogPage() {
  const search = useSearch({ from: '/log' });
  const navigate = useNavigate({ from: '/log' });
  // `q` is the box (raw), `term` the request and the cache key — as on /vacancies.
  const q = search.q ?? '';
  const term = q.trim();
  const setSearchText = (value: string) => {
    void navigate({ search: { q: value.trim() === '' ? undefined : value } });
  };

  const { query, items, total, loadMore } = useInfiniteList(['log', term], (cursor) =>
    listLogPage(term, cursor),
  );

  return (
    <section className="view view-fill">
      <div className="card">
        <div className="toolbar pt-[16px]">
          {!query.error && !query.isPending && (
            <span className="toolbar-count">
              Showing {items.length} of {total}
            </span>
          )}
          <SearchInput value={q} onChange={setSearchText} />
        </div>

        {query.error ? (
          <div className="empty-state">Failed to load the log: {query.error.message}</div>
        ) : (
          <LogTable
            loading={query.isPending}
            items={items}
            onEndReached={loadMore}
            emptyMessage={term ? 'No entries match this search.' : 'The log is empty.'}
          />
        )}
      </div>
    </section>
  );
}

function LogTable({
  loading,
  items,
  onEndReached,
  emptyMessage,
}: {
  /** The first page is on its way — VacancyTable's `loading`. */
  loading: boolean;
  items: LogEntry[];
  onEndReached: () => void;
  emptyMessage: string;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const { virtualItems, paddingTop, paddingBottom, measureElement } = useVirtualRows(
    scrollRef,
    items.length,
    onEndReached,
  );

  return (
    <div ref={scrollRef} className="table-body-scroll" data-testid="log-scroll">
      <table className="min-w-[900px] table-fixed" aria-busy={loading}>
        <thead>
          <tr>
            <th style={{ width: 110 }}>Seen</th>
            <th style={{ width: 200 }}>Company</th>
            <th>Title</th>
            <th>URL</th>
          </tr>
        </thead>
        <tbody>
          {loading && <SkeletonRows rows={8} cols={COL_COUNT} />}
          {!loading && items.length === 0 && (
            <tr>
              <td colSpan={COL_COUNT}>
                <div className="empty-state">{emptyMessage}</div>
              </td>
            </tr>
          )}
          {/* Spacers for the rows the virtualizer is not rendering — ApplicationsTable. */}
          {paddingTop > 0 && (
            <tr aria-hidden className="hover:bg-transparent">
              <td colSpan={COL_COUNT} className="border-0 p-0" style={{ height: paddingTop }} />
            </tr>
          )}
          {virtualItems.map((virtualRow) => {
            const entry = items[virtualRow.index];
            return (
              <tr
                key={entry.id}
                data-index={virtualRow.index}
                ref={measureElement}
                className="hover:bg-surface-alt"
              >
                <td className="date-cell">{dateFormatter.format(new Date(entry.createdAt))}</td>
                <td>{entry.company ?? '—'}</td>
                <td className="role-title">{entry.title ?? '—'}</td>
                <td className="break-all text-[12px]">
                  {isSafeExternalUrl(entry.url) ? (
                    <a href={entry.url} target="_blank" rel="noreferrer" className="role-link">
                      {entry.url}
                    </a>
                  ) : (
                    entry.url
                  )}
                </td>
              </tr>
            );
          })}
          {paddingBottom > 0 && (
            <tr aria-hidden className="hover:bg-transparent">
              <td colSpan={COL_COUNT} className="border-0 p-0" style={{ height: paddingBottom }} />
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
