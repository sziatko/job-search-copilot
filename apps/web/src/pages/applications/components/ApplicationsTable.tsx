import { IconEdit } from '@/components/icons';
import { Button } from '@/components/ui/Button';
import { DetailsLink } from '@/components/ui/DetailsLink';
import { EmptyState } from '@/components/ui/EmptyState';
import { ScorePill } from '@/components/ui/ScorePill';
import { type Column, Table } from '@/components/ui/Table';
import {
  CompanyHistoryButton,
  DateCell,
  RoleMeta,
  RoleTitle,
  RowError,
} from '@/components/ui/TableCells';
import { daysSinceLastMove } from '../constants';
import type { ApplicationListItem, ApplicationStatus } from '../types';
import { ApplicationStatusSelect } from './ApplicationStatusSelect';
import { CopyApplicationButton } from './CopyApplicationButton';
import { MergedComment } from './MergedComment';

const dateFormatter = new Intl.DateTimeFormat('en-US', {
  day: 'numeric',
  month: 'short',
  year: '2-digit',
});

/** The rows of /applications. Role and Comment have no width: the two split what the
 * others leave. */
export function ApplicationsTable({
  loading,
  items,
  savingIds,
  rowErrors,
  onStatusChange,
  onEdit,
  onShowCompanyHistory,
  onEndReached,
  filterKey,
  emptyMessage,
}: {
  loading: boolean;
  items: ApplicationListItem[];
  savingIds: Set<number>;
  rowErrors: Map<number, string>;
  onStatusChange: (id: number, status: ApplicationStatus) => void;
  onEdit: (item: ApplicationListItem) => void;
  onShowCompanyHistory: (company: string, vacancyId: number) => void;
  onEndReached?: () => void;
  /** The page's filter: a change scrolls the box back to the top. */
  filterKey: string;
  emptyMessage: string;
}) {
  const columns: Column<ApplicationListItem>[] = [
    {
      header: 'Date',
      width: 110,
      cell: (item) => (
        <DateCell
          date={item.appliedAt ? dateFormatter.format(new Date(item.appliedAt)) : '—'}
          quietDays={item.timedOut ? daysSinceLastMove(item) : undefined}
          // Same stamp the hourglass reads; shown only once the row has actually
          // moved, or it would just repeat the date above.
          updated={
            item.statusChangedAt !== item.appliedAt
              ? dateFormatter.format(new Date(item.statusChangedAt))
              : undefined
          }
        />
      ),
    },
    {
      header: 'Role',
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
    { header: 'Score', width: 90, cell: (item) => <ScorePill score={item.matchScore} /> },
    {
      header: 'Salary',
      width: 120,
      cell: (item) => <div className="mono text-sm">{item.salaryInApplication ?? '—'}</div>,
    },
    {
      header: 'CV',
      width: 80,
      cell: (item) => (
        <div className="text-sm text-ink-muted">{item.usedTailoredResume ? '✓' : '—'}</div>
      ),
    },
    { header: 'Comment', cell: (item) => <MergedComment comments={item.comments} /> },
    {
      header: 'Action',
      width: 136,
      // Icons, labelled by their `.tip` bubbles — the /vacancies Action column's
      // pattern. Edit waits while the row saves.
      cell: (item) => (
        <div className="flex items-center gap-1.5">
          <CopyApplicationButton
            id={item.id}
            company={item.company}
            title={item.title}
            applyUrl={item.applyUrl}
          />
          <Button
            variant="icon"
            aria-label={`Edit ${item.title} at ${item.company}`}
            disabled={savingIds.has(item.id)}
            onClick={() => onEdit(item)}
          >
            <IconEdit />
            <span className="tip">Edit</span>
          </Button>
          <DetailsLink id={item.id} />
        </div>
      ),
    },
    {
      header: 'Status',
      width: 190,
      cell: (item) => (
        <>
          <ApplicationStatusSelect
            label={`Status of ${item.title} at ${item.company}`}
            value={item.status}
            disabled={savingIds.has(item.id)}
            onChange={(status) => onStatusChange(item.id, status)}
          />
          <RowError>{rowErrors.get(item.id)}</RowError>
        </>
      ),
    },
  ];

  return (
    <Table
      label="Applications"
      columns={columns}
      items={items}
      loading={loading}
      empty={<EmptyState>{emptyMessage}</EmptyState>}
      minWidth={1210}
      virtual={{ onEndReached, resetKey: filterKey }}
    />
  );
}
