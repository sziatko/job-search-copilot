import { ExpandableText } from '@/components/ui/ExpandableText';
import type { EstimatedVacancyListItem, UserAction } from '../types';
import { MatchScoreBadge } from './MatchScoreBadge';
import { RecommendationBadge } from './RecommendationBadge';
import { UserActionSelect } from './UserActionSelect';

const dateFormatter = new Intl.DateTimeFormat('en-US', { day: 'numeric', month: 'short' });

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
  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <table className="min-w-full divide-y divide-slate-200">
        <thead className="bg-slate-50">
          <tr>
            <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
              Added
            </th>
            <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
              Vacancy
            </th>
            <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
              Score
            </th>
            <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
              Recommendation
            </th>
            <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
              Comment
            </th>
            <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
              Action
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {items.map((item) => (
            <tr key={item.id} className="hover:bg-slate-50">
              <td className="whitespace-nowrap px-4 py-3 align-top text-sm text-slate-500">
                {dateFormatter.format(new Date(item.createdAt))}
              </td>
              <td className="max-w-xs px-4 py-3 align-top">
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
              <td className="max-w-md px-4 py-3 align-top">
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
          ))}
        </tbody>
      </table>
    </div>
  );
}
