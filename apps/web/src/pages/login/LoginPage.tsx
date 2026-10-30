import { getRouteApi, useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { JscLogo } from '@/components/icons';
import { Button } from '@/components/ui/Button';
import { CenterColumn } from '@/components/ui/CenterColumn';
import { authClient } from '@/lib/auth';

const route = getRouteApi('/login');

/**
 * Sign-in, outside the shell. Google and LinkedIn leave for the provider's site and come
 * back through the API's callback, which sets the session cookie and then redirects to
 * `callbackURL`. Absolute URLs both: the callback runs on the API's origin, so a bare
 * `/` would land there. A passkey signs in right here (WebAuthn), no redirect.
 * An account is made by a social sign-in only; a passkey is added on /profile after.
 */
export function LoginPage() {
  const { error: callbackError } = route.useSearch();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const shown = error ?? (callbackError && `Sign-in failed: ${callbackError.replaceAll('_', ' ')}`);

  async function social(provider: 'google' | 'linkedin') {
    setBusy(true);
    setError(null);
    const { error } = await authClient.signIn.social({
      provider,
      callbackURL: `${window.location.origin}/`,
      errorCallbackURL: `${window.location.origin}/login`,
    });
    // On success the browser is already leaving for the provider.
    if (error) {
      setError(error.message ?? 'Sign-in failed');
      setBusy(false);
    }
  }

  async function passkey() {
    setBusy(true);
    setError(null);
    const { data, error } = await authClient.signIn.passkey();
    setBusy(false);
    if (error) setError(error.message ?? 'Passkey sign-in failed');
    // Mid-way through an MCP client's authorization the API answers `{ redirect, url }`
    // (to /consent or back to the client), and the library is already following it.
    else if (!(data && 'redirect' in data)) await navigate({ to: '/' });
  }

  return (
    <CenterColumn as="main">
      <JscLogo size={52} />
      <h2>Sign in to Job Search Copilot</h2>
      {shown && (
        <p role="alert" className="text-bad-ink">
          {shown}
        </p>
      )}
      <div className="flex w-full flex-col gap-2">
        <Button disabled={busy} onClick={() => social('google')}>
          Continue with Google
        </Button>
        <Button disabled={busy} onClick={() => social('linkedin')}>
          Continue with LinkedIn
        </Button>
        <Button variant="primary" disabled={busy} onClick={passkey}>
          Sign in with a passkey
        </Button>
      </div>
      <p>No account yet? Sign in with Google or LinkedIn first, then add a passkey on Profile.</p>
    </CenterColumn>
  );
}
