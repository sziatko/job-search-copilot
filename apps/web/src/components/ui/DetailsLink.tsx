import { Link } from '@tanstack/react-router';
import { IconArrowRight } from '@/components/icons';

/** The in-app way to a vacancy's page, beside a title that links to the posting
 * itself — the title stays external in every table, where opening the posting is
 * the common click. `newTab` is for a modal, whose context an in-place
 * navigation would throw away. */
export function DetailsLink({ id, newTab }: { id: number; newTab?: boolean }) {
  return (
    <Link
      to="/vacancies/$id"
      params={{ id: String(id) }}
      target={newTab ? '_blank' : undefined}
      aria-label="Open vacancy details"
      className="icon-btn"
    >
      <IconArrowRight />
      <span className="tip">Details</span>
    </Link>
  );
}
