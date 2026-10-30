import { Button } from '@/components/ui/Button';
import { Card, CardHead, CardTitle } from '@/components/ui/Card';
import { usePasskeys } from './useProfile';

/**
 * The signed-in user's passkeys. Adding one runs WebAuthn in the browser (the
 * authenticator makes the key pair; the API keeps only the public key), bound to
 * PASSKEY_RP_ID. A user signs up with Google or LinkedIn, then adds one here.
 */
export function PasskeysCard() {
  const { passkeys, add, remove } = usePasskeys();

  return (
    <Card>
      <CardHead>
        <CardTitle>Passkeys</CardTitle>
        <Button variant="primary" disabled={add.isPending} onClick={() => add.mutate()}>
          Add a passkey
        </Button>
      </CardHead>
      <div className="flex flex-col gap-2 px-4 pb-2">
        {passkeys.isPending && <p className="text-ink-muted">Loading…</p>}
        {passkeys.isError && <p className="text-bad-ink">Failed to load passkeys</p>}
        {passkeys.data?.length === 0 && (
          <p className="text-ink-muted">No passkeys yet. Add one to sign in without Google.</p>
        )}
        {passkeys.data && passkeys.data.length > 0 && (
          <ul className="flex flex-col gap-2">
            {passkeys.data.map((key) => (
              <li key={key.id} className="flex items-center justify-between gap-3">
                <span>
                  {key.name || 'Passkey'}
                  <span className="text-ink-muted">
                    {' '}
                    · added {new Date(key.createdAt).toLocaleDateString()}
                  </span>
                </span>
                <Button disabled={remove.isPending} onClick={() => remove.mutate(key.id)}>
                  Remove
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}
