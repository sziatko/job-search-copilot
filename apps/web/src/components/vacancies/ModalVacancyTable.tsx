import { DetailsLink } from '@/components/ui/DetailsLink';
import { ScorePill } from '@/components/ui/ScorePill';
import { type Column, Table } from '@/components/ui/Table';
import { DateCell, RoleMeta, RoleTitle } from '@/components/ui/TableCells';
import { Tag } from '@/components/ui/Tag';
import { daysSinceLastMove } from '@/lib/applications/constants';
import type { ApplicationListItem } from '@/lib/applications/types';
import type { VacancyListItem } from '@/lib/vacancies/types';
import { CopyVacancyButton } from './CopyVacancyButton';
import { StatusTag } from './StatusTag';

const dateFormatter = new Intl.DateTimeFormat('en-US', { day: 'numeric', month: 'short' });

/** A modal's subtitle over one capped page: `total` is the server's count of the
 * matches, not the size of the page it sent. */
export function countLine(shown: number, total: number) {
  return shown < total
    ? `Showing ${shown} of ${total} vacancies, newest first`
    : `${total} vacancies, newest first`;
}

/**
 * The vacancy rows of a modal — the company modal's and the search modal's: date (with
 * /applications' ⏳), vacancy, score, status, CV, Copy / Details (in a new tab: a modal's
 * context would be lost to an in-place navigation).
 */
export function ModalVacancyTable({
  items,
  applications,
  loading,
  currentId,
}: {
  items: readonly VacancyListItem[];
  /** The pipeline rows among `items`, for the ⏳ mark and the CV column — joined by id. */
  applications: readonly ApplicationListItem[] | undefined;
  loading: boolean;
  /** The row to mark Current and scroll to — the one whose button opened the modal. */
  currentId?: number;
}) {
  const applicationsByVacancy = new Map((applications ?? []).map((item) => [item.id, item]));

  const columns: Column<VacancyListItem>[] = [
    {
      header: 'Date',
      cell: (item) => {
        const application = applicationsByVacancy.get(item.id);
        return (
          <DateCell
            date={dateFormatter.format(new Date(item.createdAt))}
            quietDays={application?.timedOut ? daysSinceLastMove(application) : undefined}
          />
        );
      },
    },
    {
      header: 'Vacancy',
      cell: (item) => (
        <>
          <RoleTitle title={item.title} href={item.applyUrl} />
          {/* Which of these rows is the one you clicked — a sibling can carry another
              spelling of the company. */}
          {item.id === currentId && (
            <Tag tone="accent" className="ml-2 align-middle">
              Current
            </Tag>
          )}
          <RoleMeta company={item.company} id={item.id} />
        </>
      ),
    },
    // No analysis, no score — as on /vacancies.
    {
      header: 'Score',
      cell: (item) => <ScorePill score={item.hasAnalysis ? item.matchScore : null} />,
    },
    { header: 'Status', cell: (item) => <StatusTag status={item.status} /> },
    // /applications' CV column; a row never applied to has no CV.
    {
      header: 'CV',
      cell: (item) => (
        <div className="text-small text-ink-muted">
          {applicationsByVacancy.get(item.id)?.usedTailoredResume ? '✓' : '—'}
        </div>
      ),
    },
    {
      header: 'Actions',
      cell: (item) => (
        <div className="flex gap-2">
          <CopyVacancyButton
            id={item.id}
            company={item.company}
            title={item.title}
            applyUrl={item.applyUrl}
          />
          <DetailsLink id={item.id} newTab />
        </div>
      ),
    },
  ];

  return (
    // A long list is longer than the viewport, and `body` is `overflow: hidden` behind
    // the dialog, so the table's box has to scroll. 60vh leaves the title and the Close
    // button on screen; no minimum width, which would burst the dialog's own.
    <Table
      columns={columns}
      items={items}
      loading={loading}
      skeletonRows={4}
      minWidth={0}
      currentId={currentId}
      className="max-h-[60vh]"
    />
  );
}
