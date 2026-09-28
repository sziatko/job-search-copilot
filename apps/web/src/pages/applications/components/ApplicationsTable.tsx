import { useRef } from 'react';
import { IconEdit } from '@/components/icons';
import { ScorePill } from '@/components/ui/ScorePill';
import { useVirtualRows } from '@/components/useVirtualRows';
import { isSafeExternalUrl } from '@/lib/url';
import { daysSinceLastMove, isTimedOut } from '../constants';
import type { ApplicationListItem, ApplicationStatus } from '../types';
import { ApplicationStatusSelect } from './ApplicationStatusSelect';
import { CopyApplicationButton } from './CopyApplicationButton';
import { MergedComment } from './MergedComment';

const dateFormatter = new Intl.DateTimeFormat('en-US', {
  day: 'numeric',
  month: 'short',
  year: '2-digit',
});

const COL_COUNT = 8;

/**
 * These px widths are authoritative because the table sets `table-fixed` — in
 * auto layout they would only be hints the cell content can override, which is
 * what made the columns resize as the data changed.
 *
 * Fixed layout also means content can never widen a column; it wraps instead.
 * So each fixed width has to fit its own content PLUS the cell's 36px of
 * horizontal padding. Role and Comment are deliberately left without a width:
 * the two of them split whatever is left, down the middle.
 */

export function ApplicationsTable({
  items,
  savingIds,
  rowErrors,
  onStatusChange,
  onEdit,
  emptyMessage,
}: {
  items: ApplicationListItem[];
  savingIds: Set<number>;
  rowErrors: Map<number, string>;
  onStatusChange: (id: number, status: ApplicationStatus) => void;
  onEdit: (item: ApplicationListItem) => void;
  emptyMessage: string;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const { virtualItems, paddingTop, paddingBottom, measureElement } = useVirtualRows(
    scrollRef,
    items.length,
  );

  return (
    <div ref={scrollRef} className="table-body-scroll">
      <table className="min-w-[1210px] table-fixed">
        <thead>
          <tr>
            <th style={{ width: 110 }}>Date</th>
            <th>Role</th>
            <th style={{ width: 90 }}>Score</th>
            <th style={{ width: 120 }}>Salary</th>
            <th style={{ width: 80 }}>CV</th>
            <th>Comment</th>
            <th style={{ width: 102 }}>Action</th>
            <th style={{ width: 190 }}>Status</th>
          </tr>
        </thead>
        <tbody>
          {items.length === 0 && (
            <tr>
              <td colSpan={COL_COUNT}>
                <div className="empty-state">{emptyMessage}</div>
              </td>
            </tr>
          )}
          {/* Spacer rows that stand in for the rows the virtualizer isn't
              rendering. p-0 because `tbody td` would otherwise pad them and the
              height would no longer match what the virtualizer assumes. */}
          {paddingTop > 0 && (
            <tr aria-hidden className="hover:bg-transparent">
              <td colSpan={COL_COUNT} className="border-0 p-0" style={{ height: paddingTop }} />
            </tr>
          )}
          {virtualItems.map((virtualRow) => {
            const item = items[virtualRow.index];
            const linkable = isSafeExternalUrl(item.applyUrl);
            const moved = item.statusChangedAt !== item.appliedAt;
            return (
              <tr
                key={item.id}
                data-index={virtualRow.index}
                ref={measureElement}
                className="hover:bg-surface-alt"
              >
                <td className="date-cell">
                  {isTimedOut(item) && (
                    <span className="timeout-mark mr-[4px]">
                      ⏳
                      <span className="tip">{daysSinceLastMove(item)} days since last update</span>
                    </span>
                  )}
                  {item.appliedAt ? dateFormatter.format(new Date(item.appliedAt)) : '—'}
                  {/* Same stamp the hourglass reads; hidden until the row has
                      actually moved, or it would just repeat the date above. */}
                  {moved && (
                    <div className="date-upd">
                      upd: {dateFormatter.format(new Date(item.statusChangedAt))}
                    </div>
                  )}
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
                  <div className="role-meta">
                    {item.company} <span className="id">#{item.id}</span>
                  </div>
                </td>
                <td>
                  <ScorePill score={item.matchScore} />
                </td>
                <td className="mono text-[12px]">{item.salaryInListing ?? '—'}</td>
                <td className="text-[12px] text-ink-muted">
                  {item.usedTailoredResume ? 'Sent' : '—'}
                </td>
                <td>
                  <MergedComment comments={item.comments} />
                </td>
                <td>
                  {/* Icons, labelled by their `.tip` bubbles — the /vacancies Action
                      column's pattern. Edit waits while the row saves. */}
                  <div className="flex items-center gap-[6px]">
                    <CopyApplicationButton
                      id={item.id}
                      company={item.company}
                      title={item.title}
                      applyUrl={item.applyUrl}
                    />
                    <button
                      type="button"
                      aria-label={`Edit ${item.title} at ${item.company}`}
                      disabled={savingIds.has(item.id)}
                      onClick={() => onEdit(item)}
                      className="icon-btn disabled:opacity-50"
                    >
                      <IconEdit />
                      <span className="tip">Edit</span>
                    </button>
                  </div>
                </td>
                <td>
                  <ApplicationStatusSelect
                    value={item.status}
                    disabled={savingIds.has(item.id)}
                    onChange={(status) => onStatusChange(item.id, status)}
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
