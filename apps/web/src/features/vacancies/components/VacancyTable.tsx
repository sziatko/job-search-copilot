import { useRef } from 'react';
import { MatchScoreBadge } from '@/components/MatchScoreBadge';
import { RecommendationBadge } from '@/components/RecommendationBadge';
import { ExpandableText } from '@/components/ui/ExpandableText';
import { useVirtualRows } from '@/components/useVirtualRows';
import type { EstimatedVacancyListItem, UserAction } from '../types';
import { UserActionSelect } from './UserActionSelect';

const dateFormatter = new Intl.DateTimeFormat('en-US', { day: 'numeric', month: 'short' });

const TH = 'px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-slate-500';
const COL_COUNT = 6;

export function VacancyTable({
  items,
  savingIds,
  rowErrors,
  onActionChange,
}: {
  items: EstimatedVacancyListItem[];
  savingIds: Set<number>;
  rowErrors: Map<number, string>;
  onActionChange: (id: number, userAction: UserAction) => void;
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
          <col className="w-20" />
          <col />
          <col className="w-20" />
          <col className="w-40" />
          <col />
          <col className="w-44" />
        </colgroup>
        <thead className="sticky top-0 z-10 bg-slate-50">
          <tr>
            <th className={TH}>Added</th>
            <th className={TH}>Vacancy</th>
            <th className={TH}>Score</th>
            <th className={TH}>Recommendation</th>
            <th className={TH}>Comment</th>
            <th className={TH}>Action</th>
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
            return (
              <tr
                key={item.id}
                data-index={virtualRow.index}
                ref={measureElement}
                className="hover:bg-slate-50"
              >
                <td className="whitespace-nowrap px-4 py-3 align-top text-sm text-slate-500">
                  {dateFormatter.format(new Date(item.createdAt))}
                </td>
                <td className="px-4 py-3 align-top">
                  <a
                    href={item.applyUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="font-medium text-slate-900 hover:text-indigo-600 hover:underline"
                  >
                    {item.title}
                  </a>
                  <div className="text-sm text-slate-500">{item.company}</div>
                </td>
                <td className="px-4 py-3 align-top">
                  <MatchScoreBadge score={item.matchScore} />
                </td>
                <td className="px-4 py-3 align-top">
                  <RecommendationBadge recommendation={item.recommendation} />
                </td>
                <td className="px-4 py-3 align-top">
                  <ExpandableText text={item.estimationComment} />
                </td>
                <td className="px-4 py-3 align-top">
                  <UserActionSelect
                    value={item.userAction}
                    disabled={savingIds.has(item.id)}
                    onChange={(userAction) => onActionChange(item.id, userAction)}
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
