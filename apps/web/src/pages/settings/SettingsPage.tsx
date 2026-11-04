import { View } from '@/components/ui/View';
import { ApiKeysCard } from './ApiKeysCard';
import { ConnectedAppsCard } from './ConnectedAppsCard';
import { PasskeysCard } from './PasskeysCard';

export function SettingsPage() {
  return (
    <View>
      <div className="space-y-4 narrow:space-y-3">
        <PasskeysCard />
        <ApiKeysCard />
        <ConnectedAppsCard />
      </div>
    </View>
  );
}
