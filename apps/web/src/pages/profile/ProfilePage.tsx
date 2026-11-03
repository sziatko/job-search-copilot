import { IconPerson } from '@/components/icons';
import { ComingSoon } from '@/components/ui/ComingSoon';
import { View } from '@/components/ui/View';

export function ProfilePage() {
  return (
    <View>
      <ComingSoon
        icon={IconPerson}
        title="Profile & forms — coming soon"
        description="This is where your candidate profile will live: target roles, salary floor, locations, and the resume variants the analyzer scores against."
        items={[
          'Editable profile (stack, seniority, target rate)',
          'Resume variants per market (PL / NL / US)',
          'Saved search filters and alert rules',
        ]}
      />
    </View>
  );
}
