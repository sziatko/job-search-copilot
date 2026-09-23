import { useRef } from 'react';
import { IconCheck, IconCross, IconHistory } from '@/components/icons';
import { ExpandableText } from '@/components/ui/ExpandableText';
import { ScorePill } from '@/components/ui/ScorePill';
import { useVirtualRows } from '@/components/useVirtualRows';
import { isSafeExternalUrl } from '@/lib/url';
import { USER_ACTION_TAGS } from '../constants';
import { type EstimatedVacancyListItem, USER_ACTION, type UserAction } from '../types';
import { CopyVacancyButton } from './CopyVacancyButton';
import { RecommendationTag } from './RecommendationTag';
import { RowActionMenu } from './RowActionMenu';

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
  onShowCompanyHistory,
}: {
  items: EstimatedVacancyListItem[];
  savingIds: Set<number>;
  rowErrors: Map<number, string>;
  onActionChange: (id: number, userAction: UserAction) => void;
  /** Better than a per-row modal: the rows are virtualized, so anything mounted
   * inside one unmounts as soon as it scrolls out of the window. */
  onShowCompanyHistory: (company: string, vacancyId: number) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const { virtualItems, paddingTop, paddingBottom, measureElement } = useVirtualRows(
    scrollRef,
    items.length,
  );

  return (
    <div ref={scrollRef} className="table-body-scroll">
      <table className="min-w-[1200px] table-fixed">
        <thead>
          <tr>
            <th style={{ width: 90 }}>Added</th>
            <th>Vacancy</th>
            <th style={{ width: 90 }}>Score</th>
            <th style={{ width: 120 }}>Rec.</th>
            <th>Comment</th>
            <th style={{ width: 150 }}>Status</th>
            <th style={{ width: 180 }}>Action</th>
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
            // 1 means "no siblings" — the count includes this row.
            const others = (item.companyMatchCount ?? 0) - 1;
            const othersLabel = `${others} other ${others === 1 ? 'vacancy' : 'vacancies'} at ${item.company}`;
            const saving = savingIds.has(item.id);
            return (
              <tr
                key={item.id}
                data-index={virtualRow.index}
                ref={measureElement}
                className="hover:bg-surface-alt"
              >
                <td className="date-cell">{dateFormatter.format(new Date(item.createdAt))}</td>
                <td>
                  {isSafeExternalUrl(item.applyUrl) ? (
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
                    {others >= 1 && (
                      <button
                        type="button"
                        onClick={() => onShowCompanyHistory(item.company, item.id)}
                        className="meta-btn"
                      >
                        <IconHistory />
                        {/* The count is decoration and the bubble below is the
                            label, so the button does not read out "7, 7 other
                            vacancies at contoso". */}
                        <span aria-hidden>{others}</span>
                        <span className="tip">{othersLabel}</span>
                      </button>
                    )}
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
                  <span className={`tag ${USER_ACTION_TAGS[item.userAction].variant}`}>
                    {USER_ACTION_TAGS[item.userAction].text}
                  </span>
                </td>
                <td>
                  {/* Four controls that all mean the same thing — a status change —
                      so they save and disable together. Only Apply and Decline
                      confirm first; see requestActionChange. Icons rather than text
                      (the `.tip` bubble is the label): four words per row, repeated
                      down every row, is what made this column the widest one. */}
                  <div className="flex flex-wrap items-center gap-[6px]">
                    <CopyVacancyButton
                      id={item.id}
                      company={item.company}
                      title={item.title}
                      applyUrl={item.applyUrl}
                      disabled={saving}
                    />
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => onActionChange(item.id, USER_ACTION.APPLIED)}
                      className="icon-btn disabled:opacity-50"
                    >
                      <IconCheck />
                      <span className="tip">Apply</span>
                    </button>
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => onActionChange(item.id, USER_ACTION.DECLINED)}
                      className="icon-btn icon-btn-danger disabled:opacity-50"
                    >
                      <IconCross />
                      <span className="tip">Decline</span>
                    </button>
                    <RowActionMenu
                      disabled={saving}
                      onAction={(userAction) => onActionChange(item.id, userAction)}
                    />
                  </div>
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
