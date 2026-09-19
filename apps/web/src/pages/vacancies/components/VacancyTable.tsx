import { useRef } from 'react';
import { ExpandableText } from '@/components/ui/ExpandableText';
import { ScorePill } from '@/components/ui/ScorePill';
import { useVirtualRows } from '@/components/useVirtualRows';
import type { EstimatedVacancyListItem, UserAction } from '../types';
import { CopyVacancyButton } from './CopyVacancyButton';
import { RecommendationTag } from './RecommendationTag';
import { UserActionSelect } from './UserActionSelect';

const dateFormatter = new Intl.DateTimeFormat('en-US', { day: 'numeric', month: 'short' });

const COL_COUNT = 7;

/**
 * These px widths are authoritative because the table sets `table-fixed` — in
 * auto layout they would only be hints the cell content can override, which is
 * what made the columns resize as the data changed.
 *
 * Fixed layout also means content can never widen a column; it wraps instead.
 * So each fixed width has to fit its own content PLUS the cell's 36px of
 * horizontal padding. Vacancy and Comment are deliberately left without a
 * width: the two of them split whatever is left, down the middle.
 */

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
    <div ref={scrollRef} className="table-body-scroll">
      <table className="min-w-[1040px] table-fixed">
        <thead>
          <tr>
            <th style={{ width: 90 }}>Added</th>
            <th>Vacancy</th>
            <th style={{ width: 90 }}>Score</th>
            <th style={{ width: 120 }}>Rec.</th>
            <th>Comment</th>
            <th style={{ width: 72 }}>Copy</th>
            <th style={{ width: 190 }}>Action</th>
          </tr>
        </thead>
        <tbody>
          {paddingTop > 0 && (
            <tr aria-hidden className="hover:bg-transparent">
              <td colSpan={COL_COUNT} className="border-0 p-0" style={{ height: paddingTop }} />
            </tr>
          )}
          {virtualItems.map((virtualRow) => {
            const item = items[virtualRow.index];
            return (
              <tr
                key={item.id}
                data-index={virtualRow.index}
                ref={measureElement}
                className="hover:bg-surface-alt"
              >
                <td className="date-cell">{dateFormatter.format(new Date(item.createdAt))}</td>
                <td>
                  <a
                    href={item.applyUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="role-title role-link"
                  >
                    {item.title}
                  </a>
                  <div className="role-meta">
                    {item.company} <span className="id">#{item.id}</span>
                  </div>
                </td>
                <td>
                  <ScorePill score={item.matchScore} />
                </td>
                <td>
                  <RecommendationTag recommendation={item.recommendation} />
                </td>
                <td>
                  <ExpandableText text={item.estimationComment} />
                </td>
                <td>
                  <CopyVacancyButton
                    id={item.id}
                    company={item.company}
                    title={item.title}
                    applyUrl={item.applyUrl}
                  />
                </td>
                <td>
                  <UserActionSelect
                    value={item.userAction}
                    disabled={savingIds.has(item.id)}
                    onChange={(userAction) => onActionChange(item.id, userAction)}
                  />
                  {rowErrors.has(item.id) && (
                    <p className="mt-[4px] text-[11.5px] text-bad">{rowErrors.get(item.id)}</p>
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
