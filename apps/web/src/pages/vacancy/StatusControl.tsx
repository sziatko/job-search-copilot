import { useState } from 'react';
import { ApplicationStatusSelect } from '@/components/applications/ApplicationStatusSelect';
import { Select, type SelectOption } from '@/components/ui/Select';
import { ApplyDialog } from '@/components/vacancies/ApplyDialog';
import { ConfirmDialog } from '@/components/vacancies/ConfirmDialog';
import { SaveForLaterDialog } from '@/components/vacancies/SaveForLaterDialog';
import { actionsFor } from '@/components/vacancies/VacancyTable';
import { isPipelineStatus } from '@/lib/applications/types';
import { STATUS_LABELS } from '@/lib/vacancies/constants';
import {
  ROW_ACTION,
  type RowAction,
  VACANCY_ACTION,
  type VacancyDetail,
} from '@/lib/vacancies/types';
import type { useVacancyPage } from './useVacancyPage';

const TRIAGE_OPTIONS = Object.values(VACANCY_ACTION).map((value) => ({
  value,
  label: STATUS_LABELS[value],
}));

/**
 * Before APPLIED, the /vacancies actions — Applied records the application through its
 * dialog, Declined confirms first, Saved for later asks for an optional comment; from
 * APPLIED on, the /applications pipeline select. NEW and FILTERED_OUT come before
 * triage: their select offers what the row buttons do (`actionsFor`), under the status
 * itself.
 */
export function StatusControl({
  vacancy,
  page,
}: {
  vacancy: VacancyDetail;
  page: ReturnType<typeof useVacancyPage>;
}) {
  const [pending, setPending] = useState<'apply' | 'decline' | 'save' | null>(null);
  const { status } = vacancy;

  if (isPipelineStatus(status)) {
    return (
      <ApplicationStatusSelect
        value={status}
        disabled={page.statusSaving}
        onChange={page.movePipeline}
      />
    );
  }

  function change(next: RowAction) {
    if (next === VACANCY_ACTION.APPLIED) setPending('apply');
    else if (next === VACANCY_ACTION.DECLINED) setPending('decline');
    else if (next === VACANCY_ACTION.SAVED_FOR_LATER) setPending('save');
    else page.moveTriage(next);
  }

  const options: readonly SelectOption<RowAction>[] =
    status === ROW_ACTION.NEW || status === ROW_ACTION.FILTERED_OUT
      ? [status, ...actionsFor(vacancy)].map((value) => ({ value, label: STATUS_LABELS[value] }))
      : TRIAGE_OPTIONS;

  return (
    <>
      <Select
        label="Status"
        value={status}
        options={options}
        // An analysed FILTERED_OUT vacancy has nowhere to go.
        disabled={page.statusSaving || options.length === 1}
        onChange={change}
      />
      {pending === 'apply' && (
        <ApplyDialog
          company={vacancy.company}
          title={vacancy.title}
          onCancel={() => setPending(null)}
          onConfirm={(details) => {
            page.apply(details);
            setPending(null);
          }}
        />
      )}
      {pending === 'decline' && (
        <ConfirmDialog
          title="Decline this vacancy?"
          description={`${vacancy.title} — ${vacancy.company}`}
          confirmLabel="Decline"
          onCancel={() => setPending(null)}
          onConfirm={() => {
            page.moveTriage(VACANCY_ACTION.DECLINED);
            setPending(null);
          }}
        />
      )}
      {pending === 'save' && (
        <SaveForLaterDialog
          company={vacancy.company}
          title={vacancy.title}
          onCancel={() => setPending(null)}
          onConfirm={(comment) => {
            page.moveTriage(VACANCY_ACTION.SAVED_FOR_LATER, comment);
            setPending(null);
          }}
        />
      )}
    </>
  );
}
