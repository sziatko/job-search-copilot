import { Link } from '@tanstack/react-router';
import { IconArrowRight } from '@/components/icons';

/** The in-app way to a vacancy's page, beside a title that links to the posting
 * itself — the title stays external in every table, where opening the posting is
 * the common click. */
export function DetailsLink({ id }: { id: number }) {
  return (
    <Link
      to="/vacancies/$id"
      params={{ id: String(id) }}
      aria-label="Open vacancy details"
      className="icon-btn"
    >
      <IconArrowRight />
      <span className="tip">Details</span>
    </Link>
  );
}
