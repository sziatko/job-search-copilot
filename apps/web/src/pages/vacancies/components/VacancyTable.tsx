import { useRef } from 'react';
import { IconCheck, IconCross, IconHistory } from '@/components/icons';
import { DetailsLink } from '@/components/ui/DetailsLink';
import { ExpandableText } from '@/components/ui/ExpandableText';
import { ScorePill } from '@/components/ui/ScorePill';
import { useVirtualRows } from '@/components/useVirtualRows';
import { isSafeExternalUrl } from '@/lib/url';
import { isPipelineStatus } from '../../applications/types';
import { type ButtonStatus, STATUS_TAGS } from '../constants';
import { VACANCY_ACTION, type VacancyAction, type VacancyListItem } from '../types';
import { CopyVacancyButton } from './CopyVacancyButton';
import { RecommendationTag } from './RecommendationTag';
import { RowActionMenu } from './RowActionMenu';

const dateFormatter = new Intl.DateTimeFormat('en-US', { day: 'numeric', month: 'short' });

/** The verbs for the two statuses this cell gives a button to. Typed by
 * `Record<ButtonStatus, string>`, so it is `ACTION_CONTROL` that decides which
 * buttons exist: moving a status out of the button half leaves an excess key here,
 * and moving one in leaves this map short of a key. A status's *tag* text ("Applied")
 * is a state, not an instruction — hence separate words. */
const BUTTON_VERBS = {
  APPLIED: 'Apply',
  DECLINED: 'Decline',
} satisfies Record<ButtonStatus, string>;

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
  onEndReached,
}: {
  items: VacancyListItem[];
  savingIds: Set<number>;
  rowErrors: Map<number, string>;
  onActionChange: (id: number, status: VacancyAction) => void;
  /** Better than a per-row modal: the rows are virtualized, so anything mounted
   * inside one unmounts as soon as it scrolls out of the window. */
  onShowCompanyHistory: (company: string, vacancyId: number) => void;
  /** The next page, when the last loaded row scrolls into the window (ADR-0030). */
  onEndReached: () => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const { virtualItems, paddingTop, paddingBottom, measureElement } = useVirtualRows(
    scrollRef,
    items.length,
    onEndReached,
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
            <th style={{ width: 210 }}>Action</th>
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
            // Once applied, the row's status moves on /applications only.
            const applied = isPipelineStatus(item.status);
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
                {/* A placeholder (imported, never analysed) has no score to show:
                    its `matchScore` is the tracker's own number, and rendering it as
                    `0%` would claim an analysis that never happened. Same rule as the
                    modal's cell — one field decides, so the two cannot disagree. */}
                <td>{item.hasAnalysis ? <ScorePill score={item.matchScore} /> : '—'}</td>
                <td>
                  <RecommendationTag recommendation={item.recommendation} />
                </td>
                <td>
                  {item.estimationComment ? <ExpandableText text={item.estimationComment} /> : '—'}
                </td>
                <td>
                  <span className={`tag ${STATUS_TAGS[item.status].variant}`}>
                    {STATUS_TAGS[item.status].text}
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
                      disabled={saving || applied}
                      onClick={() => onActionChange(item.id, VACANCY_ACTION.APPLIED)}
                      className="icon-btn disabled:opacity-50"
                    >
                      <IconCheck />
                      <span className="tip">{BUTTON_VERBS.APPLIED}</span>
                    </button>
                    <button
                      type="button"
                      disabled={saving || applied}
                      onClick={() => onActionChange(item.id, VACANCY_ACTION.DECLINED)}
                      className="icon-btn icon-btn-danger disabled:opacity-50"
                    >
                      <IconCross />
                      <span className="tip">{BUTTON_VERBS.DECLINED}</span>
                    </button>
                    <RowActionMenu
                      disabled={saving || applied}
                      onAction={(status) => onActionChange(item.id, status)}
                    />
                    <DetailsLink id={item.id} />
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
