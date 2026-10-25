import { Tag } from '@/components/ui/Tag';
import { STATUS_TAGS } from '@/lib/vacancies/constants';
import type { VacancyStatus } from '@/lib/vacancies/types';

/** A vacancy's status as a table cell shows it. */
export function StatusTag({ status }: { status: VacancyStatus }) {
  const { text, tone } = STATUS_TAGS[status];
  return <Tag tone={tone}>{text}</Tag>;
}
