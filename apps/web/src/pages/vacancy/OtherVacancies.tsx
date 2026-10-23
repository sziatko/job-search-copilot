import { DetailsLink } from '@/components/ui/DetailsLink';
import { EmptyState } from '@/components/ui/EmptyState';
import { ScorePill } from '@/components/ui/ScorePill';
import { type Column, Table } from '@/components/ui/Table';
import { DateCell, RoleMeta, RoleTitle } from '@/components/ui/TableCells';
import { StatusTag } from '@/components/vacancies/StatusTag';
import type { VacancyListItem } from '@/lib/vacancies/types';
import { dateFormatter } from './format';

const COLUMNS: Column<VacancyListItem>[] = [
  {
    header: 'Added',
    width: 120,
    cell: (item) => <DateCell date={dateFormatter.format(new Date(item.createdAt))} />,
  },
  {
    header: 'Vacancy',
    cell: (item) => (
      <>
        <div className="flex items-center gap-1.5">
          <RoleTitle title={item.title} href={item.applyUrl} />
          <DetailsLink id={item.id} />
        </div>
        <RoleMeta company={item.company} id={item.id} />
      </>
    ),
  },
  {
    header: 'Score',
    width: 90,
    cell: (item) => <ScorePill score={item.hasAnalysis ? item.matchScore : null} />,
  },
  { header: 'Status', width: 150, cell: (item) => <StatusTag status={item.status} /> },
];

/** The company's other vacancies, whatever their status. */
export function OtherVacancies({ items, pending }: { items: VacancyListItem[]; pending: boolean }) {
  if (!pending && items.length === 0) {
    return <EmptyState>No other vacancies</EmptyState>;
  }
  return <Table columns={COLUMNS} items={items} loading={pending} skeletonRows={3} />;
}
