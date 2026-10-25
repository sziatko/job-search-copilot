import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { authClient } from '@/lib/auth';
import { queryKeys } from '@/lib/queryKeys';

/** Better Auth's client answers `{ data, error }` rather than throwing; React Query
 * wants a throw. */
function orThrow<T>({ data, error }: { data: T | null; error: { message?: string } | null }) {
  if (error || data === null) throw new Error(error?.message ?? 'The request failed');
  return data;
}

const onError = (error: Error) => toast.error(error.message);

/** The signed-in user's passkeys: the list, add (WebAuthn in the browser) and remove. */
export function usePasskeys() {
  const queryClient = useQueryClient();
  const passkeys = useQuery({
    queryKey: queryKeys.passkeys(),
    queryFn: async () => orThrow(await authClient.passkey.listUserPasskeys()),
  });
  const onSettled = () => queryClient.invalidateQueries({ queryKey: queryKeys.passkeys() });
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
  return { passkeys, add, remove };
}

/** The signed-in user's API keys: the list, create (the key comes back once, in
 * `create.data`) and revoke. `onCreated` clears the name field. */
export function useApiKeys(onCreated: () => void) {
  const queryClient = useQueryClient();
  const keys = useQuery({
    queryKey: queryKeys.apiKeys(),
    queryFn: async () => orThrow(await authClient.apiKey.list()).apiKeys,
  });
  const onSettled = () => queryClient.invalidateQueries({ queryKey: queryKeys.apiKeys() });
  const create = useMutation({
    mutationFn: async (keyName: string) =>
      orThrow(await authClient.apiKey.create({ name: keyName })).key,
    onSuccess: onCreated,
    onSettled,
    onError,
  });
  const revoke = useMutation({
    mutationFn: async (keyId: string) => orThrow(await authClient.apiKey.delete({ keyId })),
    onSettled,
    onError,
  });
  return { keys, create, revoke };
}
