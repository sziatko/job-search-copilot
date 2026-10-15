import { useRef } from 'react';
import {
  IconBan,
  IconBookmark,
  IconCheck,
  IconCross,
  IconFilter,
  IconHistory,
  IconUndo,
} from '@/components/icons';
import { DetailsLink } from '@/components/ui/DetailsLink';
import { ExpandableText } from '@/components/ui/ExpandableText';
import { ScorePill } from '@/components/ui/ScorePill';
import { SkeletonRows } from '@/components/ui/SkeletonRows';
import { useVirtualRows } from '@/components/useVirtualRows';
import { isSafeExternalUrl } from '@/lib/url';
import { isPipelineStatus } from '../../applications/types';
import { STATUS_TAGS } from '../constants';
import {
  ROW_ACTION,
  type RowAction,
  VACANCY_ACTION,
  type VacancyAction,
  type VacancyListItem,
} from '../types';
import { CopyVacancyButton } from './CopyVacancyButton';
import { RecommendationTag } from './RecommendationTag';

const dateFormatter = new Intl.DateTimeFormat('en-US', { day: 'numeric', month: 'short' });

/** One button per action, in the order they render. Total over `RowAction`, so a
 * new action cannot ship without a control. A status's *tag*
 * text ("Applied") is a state, not an instruction — hence separate verbs. Which ones
 * confirm first is `useVacancies`' call, not this map's. */
const ROW_BUTTONS: Record<RowAction, { verb: string; Icon: typeof IconCheck; danger?: boolean }> = {
  APPLIED: { verb: 'Apply', Icon: IconCheck },
  DECLINED: { verb: 'Decline', Icon: IconCross, danger: true },
  SAVED_FOR_LATER: { verb: 'Save for later', Icon: IconBookmark },
  UNAVAILABLE: { verb: 'Mark unavailable', Icon: IconBan },
  NOT_REVIEWED: { verb: 'Mark not reviewed', Icon: IconUndo },
  FILTERED_OUT: { verb: 'Filter out', Icon: IconFilter, danger: true },
  NEW: { verb: 'Back to queue', Icon: IconUndo },
};
/** The /vacancies actions, in ROW_BUTTONS' order. */
const VACANCY_ACTIONS = (Object.keys(ROW_BUTTONS) as RowAction[]).filter(
  (action): action is VacancyAction => action in VACANCY_ACTION,
);

/** The status buttons a row gets — the lifecycle the UI enforces (ADR-0033); the
 * vacancy page's select offers the same. A NEW row leaves only for FILTERED_OUT (its
 * other exit is an analysis); a FILTERED_OUT one goes back to the queue only while it
 * has no analysis (the server refuses it otherwise). Any other row gets every /vacancies
 * action but its own — a triage repeat carries no event, and the server refuses it — a
 * pipeline row (one just applied to, until the refetch drops it) counting as Applied. */
export function actionsFor({
  status,
  recommendation,
}: Pick<VacancyListItem, 'status' | 'recommendation'>): RowAction[] {
  if (status === ROW_ACTION.NEW) return [ROW_ACTION.FILTERED_OUT];
  if (status === ROW_ACTION.FILTERED_OUT) return recommendation === null ? [ROW_ACTION.NEW] : [];
  const own = isPipelineStatus(status) ? VACANCY_ACTION.APPLIED : status;
  return VACANCY_ACTIONS.filter((action) => action !== own);
}

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
  loading,
  items,
  savingIds,
  rowErrors,
  onActionChange,
  onShowCompanyHistory,
  onEndReached,
  filterKey,
}: {
  /** The first page is on its way: skeleton rows under the real header. `items` is
   * empty until then, so `onEndReached` cannot fire over the skeleton. */
  loading: boolean;
  items: VacancyListItem[];
  savingIds: Set<number>;
  rowErrors: Map<number, string>;
  onActionChange: (id: number, status: RowAction) => void;
  /** Better than a per-row modal: the rows are virtualized, so anything mounted
   * inside one unmounts as soon as it scrolls out of the window. */
  onShowCompanyHistory: (company: string, vacancyId: number) => void;
  /** The next page, when the last loaded row scrolls into the window (ADR-0030). */
  onEndReached: () => void;
  /** The page's filter: a change scrolls the box back to the top. */
  filterKey: string;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const { virtualItems, paddingTop, paddingBottom, measureElement } = useVirtualRows(
    scrollRef,
    items.length,
    onEndReached,
    filterKey,
  );

  return (
    <div ref={scrollRef} className="table-body-scroll">
      <table className="min-w-[1200px] table-fixed" aria-busy={loading}>
        <thead>
          <tr>
            <th style={{ width: 90 }}>Added</th>
            <th>Vacancy</th>
            <th style={{ width: 90 }}>Score</th>
            <th style={{ width: 120 }}>Rec.</th>
            <th>Comment</th>
            <th style={{ width: 150 }}>Status</th>
            <th style={{ width: 246 }}>Action</th>
          </tr>
        </thead>
        <tbody>
          {loading && <SkeletonRows rows={8} cols={COL_COUNT} />}
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
                  {/* The status buttons all mean the same thing — a status change —
                      so they save and disable together. Only Apply and Decline
                      confirm first; see requestActionChange. Icons rather than text
                      (the `.tip` bubble is the label): words per row, repeated down
                      every row, are what made this column the widest one. */}
                  <div className="flex flex-wrap items-center gap-[6px]">
                    <CopyVacancyButton
                      id={item.id}
                      company={item.company}
                      title={item.title}
                      applyUrl={item.applyUrl}
                      disabled={saving}
                    />
                    {actionsFor(item).map((action) => {
                      const { verb, Icon, danger } = ROW_BUTTONS[action];
                      return (
                        <button
                          key={action}
                          type="button"
                          disabled={saving || applied}
                          onClick={() => onActionChange(item.id, action)}
                          className={`icon-btn ${danger ? 'icon-btn-danger ' : ''}disabled:opacity-50`}
                        >
                          <Icon />
                          <span className="tip">{verb}</span>
                        </button>
                      );
                    })}
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
