import { useNavigate, useSearch } from '@tanstack/react-router';
import { listVacanciesPage } from '@/lib/vacancies/api';
import {
  STATUS_CONTEXT,
  STATUS_FILTER_ALL,
  type StatusFilterValue,
  VACANCY_ACTION,
  type VacancyStatus,
} from '@/lib/vacancies/types';
import { useVacancyRows } from '@/lib/vacancies/useVacancyRows';

/** The filter as the API's `status` — All is the page's own statuses, never the whole
 * table: NEW / FILTERED_OUT are /inbox's, the pipeline /applications'. */
function statusesFor(filter: StatusFilterValue): readonly VacancyStatus[] {
  return filter === STATUS_FILTER_ALL ? STATUS_CONTEXT.vacancies.options : [filter];
}

/** /vacancies: the status filter, in the URL, over the shared vacancy rows. Search is
 * the search modal's, never this table's. */
export function useVacancies() {
  const search = useSearch({ from: '/_app/vacancies' });
  const navigate = useNavigate({ from: '/vacancies' });

  // NOT_REVIEWED (the triage queue) is the absent value.
  const statusFilter = search.status ?? VACANCY_ACTION.NOT_REVIEWED;
  const setStatusFilter = (value: StatusFilterValue) => {
    void navigate({
      search: (prev) => ({
        ...prev,
        status: value === VACANCY_ACTION.NOT_REVIEWED ? undefined : value,
      }),
    });
  };

  const rows = useVacancyRows([statusFilter], (cursor) =>
    listVacanciesPage({ status: statusesFor(statusFilter), sort: 'recommended', cursor }),
  );

  return { ...rows, statusFilter, setStatusFilter };
}
