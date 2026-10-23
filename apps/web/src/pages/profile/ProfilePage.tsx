import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useId, useState } from 'react';
import { toast } from 'sonner';
import { IconPerson } from '@/components/icons';
import { Button } from '@/components/ui/Button';
import { Card, CardHead, CardTitle } from '@/components/ui/Card';
import { Input, Label } from '@/components/ui/Field';
import { SoonPage } from '@/components/ui/SoonPage';
import { authClient } from '@/lib/auth';
import { queryKeys } from '@/lib/queryKeys';

/** Better Auth's client answers `{ data, error }` rather than throwing; React Query
 * wants a throw. */
function orThrow<T>({ data, error }: { data: T | null; error: { message?: string } | null }) {
  if (error || data === null) throw new Error(error?.message ?? 'The request failed');
  return data;
}

/**
 * The signed-in user's passkeys. Adding one runs WebAuthn in the browser (the
 * authenticator makes the key pair; the API keeps only the public key), bound to
 * PASSKEY_RP_ID. A user signs up with Google or LinkedIn, then adds one here.
 */
function PasskeysCard() {
  const queryClient = useQueryClient();
  const passkeys = useQuery({
    queryKey: queryKeys.passkeys(),
    queryFn: async () => orThrow(await authClient.passkey.listUserPasskeys()),
  });
  const onSettled = () => queryClient.invalidateQueries({ queryKey: queryKeys.passkeys() });
  const onError = (error: Error) => toast.error(error.message);
  const add = useMutation({
    mutationFn: async () => orThrow(await authClient.passkey.addPasskey()),
    onSettled,
    onError,
  });
  const remove = useMutation({
    mutationFn: async (id: string) => orThrow(await authClient.passkey.deletePasskey({ id })),
    onSettled,
    onError,
  });

  return (
    <section className="view pb-0">
      <Card>
        <CardHead>
          <CardTitle>Passkeys</CardTitle>
          <Button variant="primary" disabled={add.isPending} onClick={() => add.mutate()}>
            Add a passkey
          </Button>
        </CardHead>
        <div className="flex flex-col gap-2.5 px-4.5 pb-2.5">
          {passkeys.isPending && <p className="text-ink-muted">Loading…</p>}
          {passkeys.isError && <p className="text-bad">Failed to load passkeys</p>}
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
    </section>
  );
}

/**
 * The signed-in user's API keys, for n8n and MCP (ADR-0039): each acts as this user.
 * The API keeps only a hash, so a new key is shown once, here, to copy. Revoke deletes
 * it; whatever still sends it gets a 401.
 */
function ApiKeysCard() {
  const queryClient = useQueryClient();
  const nameId = useId();
  const [name, setName] = useState('');
  const keys = useQuery({
    queryKey: queryKeys.apiKeys(),
    queryFn: async () => orThrow(await authClient.apiKey.list()).apiKeys,
  });
  const onSettled = () => queryClient.invalidateQueries({ queryKey: queryKeys.apiKeys() });
  const onError = (error: Error) => toast.error(error.message);
  const create = useMutation({
    mutationFn: async (keyName: string) =>
      orThrow(await authClient.apiKey.create({ name: keyName })).key,
    onSuccess: () => setName(''),
    onSettled,
    onError,
  });
  const revoke = useMutation({
    mutationFn: async (keyId: string) => orThrow(await authClient.apiKey.delete({ keyId })),
    onSettled,
    onError,
  });
  const copy = async (key: string) => {
    try {
      await navigator.clipboard.writeText(key);
      toast.success('Key copied');
    } catch {
      toast.error('Could not copy: select the key and copy it by hand');
    }
  };

  return (
    <section className="view pb-0">
      <Card>
        <CardHead>
          <CardTitle>API keys</CardTitle>
        </CardHead>
        <div className="flex flex-col gap-2.5 px-4.5 pb-2.5">
          <form
            className="flex items-end gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              create.mutate(name.trim());
            }}
          >
            <div className="flex-1">
              <Label htmlFor={nameId}>Key name</Label>
              <Input
                id={nameId}
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. n8n"
              />
            </div>
            <Button type="submit" variant="primary" disabled={create.isPending || !name.trim()}>
              Create a key
            </Button>
          </form>
          {create.data && (
            <div className="flex flex-col gap-2">
              <p>Copy this key now: it will not be shown again.</p>
              <div className="flex items-center gap-3">
                <code className="break-all">{create.data}</code>
                <Button onClick={() => copy(create.data)}>Copy</Button>
              </div>
            </div>
          )}
          {keys.isPending && <p className="text-ink-muted">Loading…</p>}
          {keys.isError && <p className="text-bad">Failed to load API keys</p>}
          {keys.data?.length === 0 && (
            <p className="text-ink-muted">No API keys yet. Create one for n8n or MCP.</p>
          )}
          {keys.data && keys.data.length > 0 && (
            <ul className="flex flex-col gap-2">
              {keys.data.map((key) => (
                <li key={key.id} className="flex items-center justify-between gap-3">
                  <span>
                    {key.name || 'API key'}
                    <span className="text-ink-muted">
                      {' '}
                      · {key.start}… · created {new Date(key.createdAt).toLocaleDateString()} ·{' '}
                      {key.lastRequest
                        ? `last used ${new Date(key.lastRequest).toLocaleDateString()}`
                        : 'never used'}
                    </span>
                  </span>
                  <Button disabled={revoke.isPending} onClick={() => revoke.mutate(key.id)}>
                    Revoke
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Card>
    </section>
  );
}

export function ProfilePage() {
  return (
    <>
      <PasskeysCard />
      <ApiKeysCard />
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
    </>
  );
}
