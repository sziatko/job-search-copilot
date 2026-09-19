import { IconLayers } from '@/components/icons';
import { SoonPage } from '@/components/ui/SoonPage';

/**
 * The mockup has a full view here. Nothing in the backend does — there is no
 * ingestion log table, no source column, and no record of duplicates, so this
 * is a placeholder rather than a screen rendering invented numbers.
 */
export function LogPage() {
  return (
    <SoonPage
      icon={IconLayers}
      title="Vacancy log — coming soon"
      description="There is no ingestion log yet. Postings are deduped by applyUrl, but a duplicate is discarded silently: nothing records that it was seen, where it came from, or that it was filtered out before scoring."
      items={[
        'Every posting seen, including ones that never reached the analyzer',
        'Source per entry (email digest / manual / LinkedIn)',
        'Duplicates linked to the entry they collided with',
        'Below-threshold rejections, with the reason',
      ]}
    />
  );
}
