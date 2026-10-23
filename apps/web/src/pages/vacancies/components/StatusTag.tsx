import { Tag } from '@/components/ui/Tag';
import { STATUS_TAGS } from '../constants';
import type { VacancyStatus } from '../types';

/** A vacancy's status as a table cell shows it. */
export function StatusTag({ status }: { status: VacancyStatus }) {
  const { text, tone } = STATUS_TAGS[status];
  return <Tag tone={tone}>{text}</Tag>;
}
