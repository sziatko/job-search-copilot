import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { IconPerson } from '@/components/icons';
import { SoonPage } from '@/components/ui/SoonPage';
import { authClient } from '@/lib/auth';

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
    queryKey: ['passkeys'],
    queryFn: async () => orThrow(await authClient.passkey.listUserPasskeys()),
  });
  const onSettled = () => queryClient.invalidateQueries({ queryKey: ['passkeys'] });
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
      <div className="card">
        <div className="card-head">
          <h2>Passkeys</h2>
          <button
            type="button"
            className="btn btn-primary"
            disabled={add.isPending}
            onClick={() => add.mutate()}
          >
            Add a passkey
          </button>
        </div>
        <div className="toolbar flex-col items-stretch">
          {passkeys.isPending && <p className="text-ink-muted">Loading…</p>}
          {passkeys.isError && <p className="text-bad">Failed to load passkeys</p>}
          {passkeys.data?.length === 0 && (
            <p className="text-ink-muted">No passkeys yet. Add one to sign in without Google.</p>
          )}
          {passkeys.data && passkeys.data.length > 0 && (
            <ul className="flex flex-col gap-[8px]">
              {passkeys.data.map((key) => (
                <li key={key.id} className="flex items-center justify-between gap-[12px]">
                  <span>
                    {key.name || 'Passkey'}
                    <span className="text-ink-muted">
                      {' '}
                      · added {new Date(key.createdAt).toLocaleDateString()}
                    </span>
                  </span>
                  <button
                    type="button"
                    className="btn"
                    disabled={remove.isPending}
                    onClick={() => remove.mutate(key.id)}
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}

export function ProfilePage() {
  return (
    <>
      <PasskeysCard />
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
