import { IconPerson } from '@/components/icons';
import { SoonPage } from '@/components/ui/SoonPage';

export function ProfilePage() {
  return (
    <SoonPage
      icon={IconPerson}
      title="Profile & forms — coming soon"
      description="This is where your candidate profile will live: target roles, salary floor, locations, and the resume variants the analyzer scores against."
      items={[
        'Editable profile (stack, seniority, target rate)',
        'Resume variants per market (PL / NL / US)',
        'Saved search filters and alert rules',
      ]}
    />
  );
}
