import { useRef } from 'react';
import { MatchScoreBadge } from '@/components/MatchScoreBadge';
import { useVirtualRows } from '@/components/useVirtualRows';
import type { ApplicationListItem, ApplicationStatus } from '../types';
import { ApplicationStatusSelect } from './ApplicationStatusSelect';
import { MergedComment } from './MergedComment';

const dateFormatter = new Intl.DateTimeFormat('en-US', {
  day: 'numeric',
  month: 'short',
  year: '2-digit',
});

const TH =
  'px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-slate-500 whitespace-nowrap';
const COL_COUNT = 7;

export function ApplicationsTable({
  items,
  savingIds,
  rowErrors,
  onStatusChange,
}: {
  items: ApplicationListItem[];
  savingIds: Set<number>;
  rowErrors: Map<number, string>;
  onStatusChange: (id: number, status: ApplicationStatus) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const { virtualItems, paddingTop, paddingBottom, measureElement } = useVirtualRows(
    scrollRef,
    items.length,
  );

  return (
    <div
      ref={scrollRef}
      className="max-h-[70vh] overflow-auto rounded-xl border border-slate-200 bg-white shadow-sm"
    >
      <table className="min-w-full table-fixed divide-y divide-slate-200">
        <colgroup>
          <col className="w-24" />
          <col />
          <col className="w-20" />
          <col className="w-40" />
          <col className="w-24" />
          <col />
          <col className="w-40" />
        </colgroup>
        <thead className="sticky top-0 z-10 bg-slate-50">
          <tr>
            <th className={TH}>Applied</th>
            <th className={TH}>Role</th>
            <th className={TH}>Score</th>
            <th className={TH}>Salary in listing</th>
            <th className={TH}>Tailored CV</th>
            <th className={TH}>Comment</th>
            <th className={TH}>Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {paddingTop > 0 && (
            <tr aria-hidden>
              <td colSpan={COL_COUNT} style={{ height: paddingTop }} />
            </tr>
          )}
          {virtualItems.map((virtualRow) => {
            const item = items[virtualRow.index];
            const isSynthetic = item.applyUrl.startsWith('tracker://');
            return (
              <tr
                key={item.id}
                data-index={virtualRow.index}
                ref={measureElement}
                className="hover:bg-slate-50"
              >
                <td className="whitespace-nowrap px-4 py-3 align-top text-sm text-slate-500">
                  {dateFormatter.format(new Date(item.appliedAt))}
                </td>
                <td className="px-4 py-3 align-top">
                  {isSynthetic ? (
                    <span className="font-medium text-slate-900">{item.title}</span>
                  ) : (
                    <a
                      href={item.applyUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="font-medium text-slate-900 hover:text-indigo-600 hover:underline"
                    >
                      {item.title}
                    </a>
                  )}
                  <div className="text-sm text-slate-500">{item.company}</div>
                </td>
                <td className="px-4 py-3 align-top">
                  <MatchScoreBadge score={item.matchScore} />
                </td>
                <td className="px-4 py-3 align-top text-sm text-slate-600">
                  {item.salaryInListing ?? '—'}
                </td>
                <td className="px-4 py-3 align-top text-sm text-slate-600">
                  {item.usedTailoredResume ? '✓' : '—'}
                </td>
                <td className="px-4 py-3 align-top">
                  <MergedComment
                    userComment={item.userComment}
                    estimationComment={item.estimationComment}
                  />
                </td>
                <td className="px-4 py-3 align-top">
                  <ApplicationStatusSelect
                    value={item.status}
                    disabled={savingIds.has(item.id)}
                    onChange={(status) => onStatusChange(item.id, status)}
                  />
                  {rowErrors.has(item.id) && (
                    <p className="mt-1 text-xs text-red-600">{rowErrors.get(item.id)}</p>
                  )}
                </td>
              </tr>
            );
          })}
          {paddingBottom > 0 && (
            <tr aria-hidden>
              <td colSpan={COL_COUNT} style={{ height: paddingBottom }} />
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
