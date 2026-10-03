import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { recordApplication, updateApplicationStatus } from '../applications/api';
import type { ApplicationStatus } from '../applications/types';
import { addComment, getVacancy, listVacanciesPage, updateVacancyStatus } from '../vacancies/api';
import type { ApplyDetails } from '../vacancies/components/ApplyDialog';
import { toastMoved } from '../vacancies/constants';
import type { RowAction } from '../vacancies/types';

/** Every cache a write on this page can make stale — this record, the tables that list
 * it, the company views, the dashboard's counts. */
const AFFECTED_KEYS = [
  ['vacancies'],
  ['applications'],
  ['application-company'],
  ['vacancy-company'],
  ['stats'],
] as const;

/**
 * One vacancy and its company's others, and the page's writes. Not optimistic, unlike
 * the tables: it is one record, so the control waits for the server and the page
 * refetches what it shows.
 */
export function useVacancyPage(id: number) {
  const queryClient = useQueryClient();

  const vacancy = useQuery({
    queryKey: ['vacancy', id],
    queryFn: () => getVacancy(id),
    enabled: Number.isInteger(id),
  });

  const company = vacancy.data?.company;
  // The key CompanyHistoryModal uses for the same request, so the two share a cache.
  const others = useQuery({
    queryKey: ['vacancy-company', company],
    queryFn: () => listVacanciesPage({ sameCompanyAs: company, limit: 100 }),
    enabled: company !== undefined,
  });

  function refetchAffected() {
    void queryClient.invalidateQueries({ queryKey: ['vacancy', id] });
    for (const queryKey of AFFECTED_KEYS) {
      void queryClient.invalidateQueries({ queryKey });
    }
  }

  // Three requests move the status — which one depends on where the vacancy is — so
  // the mutation takes the request itself and they share one pending / error state.
  const statusWrite = useMutation({
    mutationFn: (request: () => Promise<unknown>) => request(),
    onSettled: refetchAffected,
  });

  const commentWrite = useMutation({
    mutationFn: (body: string) => addComment(id, body),
    onSettled: refetchAffected,
  });

  // The controls are drawn from the loaded vacancy, so its data is there by now.
  const moved = (status: RowAction | ApplicationStatus) => () => {
    if (vacancy.data) toastMoved(status, vacancy.data);
  };

  return {
    vacancy,
    others: (others.data?.items ?? []).filter((item) => item.id !== id),
    othersPending: others.isPending,
    statusSaving: statusWrite.isPending,
    statusError: statusWrite.error?.message ?? null,
    moveTriage: (status: RowAction) =>
      statusWrite.mutate(() => updateVacancyStatus(id, status), { onSuccess: moved(status) }),
    movePipeline: (status: ApplicationStatus) =>
      statusWrite.mutate(() => updateApplicationStatus(id, status), {
        onSuccess: moved(status),
      }),
    apply: (details: ApplyDetails) =>
      statusWrite.mutate(
        () =>
          recordApplication({
            vacancyId: id,
            salaryInApplication: details.salary || undefined,
            usedTailoredResume: details.usedTailoredResume,
            comment: details.comment || undefined,
          }),
        { onSuccess: () => toast.success('Application submitted!') },
      ),
    addComment: (body: string, onDone: () => void) =>
      commentWrite.mutate(body, {
        onSuccess: () => {
          onDone();
          toast.success('Comment added');
        },
      }),
    commentSaving: commentWrite.isPending,
    commentError: commentWrite.error?.message ?? null,
  };
}
