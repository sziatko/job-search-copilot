import { Button } from '@/components/ui/Button';
import { Card, CardHead, CardTitle } from '@/components/ui/Card';
import { useConnectedApps } from './useProfile';

/**
 * The MCP clients the user has allowed on /consent (ADR-0035), each acting as this user.
 * Revoke ends the grant: the app can no longer refresh, and the access token it already
 * holds (a JWT) runs out within the hour.
 */
export function ConnectedAppsCard() {
  const { apps, revoke } = useConnectedApps();

  return (
    <Card>
      <CardHead>
        <CardTitle>Connected apps</CardTitle>
      </CardHead>
      <div className="flex flex-col gap-2.5 px-4.5 pb-2.5">
        {apps.isPending && <p className="text-ink-muted">Loading…</p>}
        {apps.isError && <p className="text-bad">Failed to load connected apps</p>}
        {apps.data?.length === 0 && (
          <p className="text-ink-muted">No apps connected. Claude connects here through MCP.</p>
        )}
        {apps.data && apps.data.length > 0 && (
          <>
            <ul className="flex flex-col gap-2">
              {apps.data.map((app) => (
                <li key={app.id} className="flex items-center justify-between gap-3">
                  <span>
                    {app.name || 'An app'}
                    <span className="text-ink-muted">
                      {' '}
                      · connected {new Date(app.createdAt).toLocaleDateString()}
                    </span>
                  </span>
                  <Button disabled={revoke.isPending} onClick={() => revoke.mutate(app.id)}>
                    Revoke
                  </Button>
                </li>
              ))}
            </ul>
            <p className="text-ink-muted">
              Revoked, an app is cut off within the hour its last token lives.
            </p>
          </>
        )}
      </div>
    </Card>
  );
}
