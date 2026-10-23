import {
  IconBan,
  IconBookmark,
  IconCheck,
  IconCross,
  IconFilter,
  IconUndo,
} from '@/components/icons';
import { Button } from '@/components/ui/Button';
import { DetailsLink } from '@/components/ui/DetailsLink';
import { ExpandableText } from '@/components/ui/ExpandableText';
import { ScorePill } from '@/components/ui/ScorePill';
import { type Column, Table } from '@/components/ui/Table';
import {
  CompanyHistoryButton,
  DateCell,
  RoleMeta,
  RoleTitle,
  RowError,
} from '@/components/ui/TableCells';
import { Tip } from '@/components/ui/Tip';
import { isPipelineStatus } from '@/lib/applications/types';
import {
  ROW_ACTION,
  type RowAction,
  VACANCY_ACTION,
  type VacancyAction,
  type VacancyListItem,
} from '@/lib/vacancies/types';
import { CopyVacancyButton } from './CopyVacancyButton';
import { RecommendationTag } from './RecommendationTag';
import { StatusTag } from './StatusTag';

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

/** The rows of /vacancies and /inbox. Vacancy and Comment have no width: the two split
 * what the others leave. */
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
  loading: boolean;
  items: VacancyListItem[];
  savingIds: Set<number>;
  rowErrors: Map<number, string>;
  onActionChange: (id: number, status: RowAction) => void;
  /** Better than a per-row modal: the rows are virtualized, so anything mounted
   * inside one unmounts as soon as it scrolls out of the window. */
  onShowCompanyHistory: (company: string, vacancyId: number) => void;
  onEndReached: () => void;
  /** The page's filter: a change scrolls the box back to the top. */
  filterKey: string;
}) {
  const columns: Column<VacancyListItem>[] = [
    {
      header: 'Added',
      width: 90,
      cell: (item) => <DateCell date={dateFormatter.format(new Date(item.createdAt))} />,
    },
    {
      header: 'Vacancy',
      cell: (item) => (
        <>
          <RoleTitle title={item.title} href={item.applyUrl} />
          <RoleMeta company={item.company} id={item.id}>
            <CompanyHistoryButton
              company={item.company}
              matchCount={item.companyMatchCount}
              onClick={() => onShowCompanyHistory(item.company, item.id)}
            />
          </RoleMeta>
        </>
      ),
    },
    {
      header: 'Score',
      width: 90,
      // No analysis, no score. Same rule as the modal's cell — one field decides, so
      // the two cannot disagree.
      cell: (item) => <ScorePill score={item.hasAnalysis ? item.matchScore : null} />,
    },
    {
      header: 'Rec.',
      width: 120,
      cell: (item) => <RecommendationTag recommendation={item.recommendation} />,
    },
    {
      header: 'Comment',
      cell: (item) =>
        item.estimationComment ? <ExpandableText>{item.estimationComment}</ExpandableText> : '—',
    },
    { header: 'Status', width: 150, cell: (item) => <StatusTag status={item.status} /> },
    {
      header: 'Action',
      width: 246,
      cell: (item) => {
        const saving = savingIds.has(item.id);
        // Once applied, the row's status moves on /applications only.
        const applied = isPipelineStatus(item.status);
        return (
          <>
            {/* The status buttons all mean the same thing — a status change — so they
                save and disable together. Only Apply and Decline confirm first; see
                requestActionChange. Icons rather than text (the `Tip` is the
                label): words per row, repeated down every row, are what made this
                column the widest one. */}
            <div className="flex flex-wrap items-center gap-1.5">
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
                  <Button
                    key={action}
                    variant={danger ? 'iconDanger' : 'icon'}
                    disabled={saving || applied}
                    onClick={() => onActionChange(item.id, action)}
                  >
                    <Icon />
                    <Tip>{verb}</Tip>
                  </Button>
                );
              })}
              <DetailsLink id={item.id} />
            </div>
            <RowError>{rowErrors.get(item.id)}</RowError>
          </>
        );
      },
    },
  ];

  return (
    <Table
      label="Vacancies"
      columns={columns}
      items={items}
      loading={loading}
      minWidth={1200}
      virtual={{ onEndReached, resetKey: filterKey }}
    />
  );
}
