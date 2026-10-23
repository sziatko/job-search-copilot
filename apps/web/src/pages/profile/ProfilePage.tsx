import { IconPerson } from '@/components/icons';
import { ComingSoon } from '@/components/ui/ComingSoon';
import { View } from '@/components/ui/View';
import { ApiKeysCard } from './ApiKeysCard';
import { PasskeysCard } from './PasskeysCard';

export function ProfilePage() {
  return (
    <View>
      <div className="space-y-4 narrow:space-y-3">
        <PasskeysCard />
        <ApiKeysCard />
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
      </div>
    </View>
  );
}
