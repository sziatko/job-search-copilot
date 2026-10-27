import { useQuery } from '@tanstack/react-query';
import { useLocation } from '@tanstack/react-router';
import { useState } from 'react';
import { JscLogo } from '@/components/icons';
import { Button } from '@/components/ui/Button';
import { CenterColumn } from '@/components/ui/CenterColumn';
import { authClient } from '@/lib/auth';
import { queryKeys } from '@/lib/queryKeys';

/**
 * "Allow this app to use JSC?" — where the API sends a signed-in user when an MCP client
 * (Claude, the MCP Inspector) asks for access (ADR-0035). The URL is the client's
 * request, signed by the API; Allow or Deny posts it back (`oauthProviderClient` adds
 * it), and the API answers with the client's redirect URI — with a code, or with
 * `access_denied` — which the library follows.
 */
export function ConsentPage() {
  const search = new URLSearchParams(useLocation().searchStr);
  const clientId = search.get('client_id') ?? '';
  const scopes = search.get('scope')?.split(' ') ?? [];
  // Where Allow sends the code: the API accepts only known callbacks, and the user sees
  // which one, since the client's name proves nothing.
  const redirectUri = search.get('redirect_uri') ?? '';
  const redirectHost = URL.canParse(redirectUri) ? new URL(redirectUri).host : null;
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // A client registers itself (RFC 7591) and names itself; the name is its own claim.
  const client = useQuery({
    queryKey: queryKeys.oauthClient(clientId),
    queryFn: async () =>
      (await authClient.oauth2.publicClient({ query: { client_id: clientId } })).data,
  });
  const name = client.data?.client_name || 'An app';

  async function answer(accept: boolean) {
    setBusy(true);
    setError(null);
    const { error } = await authClient.oauth2.consent({ accept });
    // On success the browser is already leaving for the client.
    if (error) {
      setError(error.message ?? 'The request failed');
      setBusy(false);
    }
  }

  return (
    <CenterColumn as="main">
      <JscLogo size={52} />
      <h2>{name} wants to use Job Search Copilot</h2>
      <p>
        It will act as you through the MCP tools: read and change your vacancies and applications.
      </p>
      {redirectHost && <p className="text-ink-muted">Allow returns you to {redirectHost}.</p>}
      {scopes.length > 0 && <p className="text-ink-muted">Requested scopes: {scopes.join(', ')}</p>}
      {error && (
        <p role="alert" className="text-bad">
          {error}
        </p>
      )}
      <div className="flex w-full flex-col gap-2.5">
        <Button variant="primary" disabled={busy} onClick={() => answer(true)}>
          Allow
        </Button>
        <Button disabled={busy} onClick={() => answer(false)}>
          Deny
        </Button>
      </div>
    </CenterColumn>
  );
}
