import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { env } from './db';
import { expect, test } from './fixtures';

const apiOrigin = env('BETTER_AUTH_URL');

test.describe('signed out', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('/login?error=… shows the alert', async ({ page }) => {
    await page.goto('/login?error=access_denied');
    await expect(page.getByRole('alert')).toHaveText('Sign-in failed: access denied');
  });

  // No real provider: the browser only has to head for it, with JSC's client id.
  for (const [button, provider, clientId] of [
    ['Continue with Google', 'https://accounts.google.com/**', env('GOOGLE_CLIENT_ID')],
    ['Continue with LinkedIn', 'https://www.linkedin.com/**', env('LINKEDIN_CLIENT_ID')],
  ]) {
    test(`${button} heads for the provider`, async ({ page }) => {
      await page.route(provider, (route) => route.fulfill({ body: 'the provider' }));
      await page.goto('/login');
      const [request] = await Promise.all([
        page.waitForRequest(provider),
        page.getByRole('button', { name: button }).click(),
      ]);
      expect(new URL(request.url()).searchParams.get('client_id')).toBe(clientId);
    });
  }
});

test('a passkey: add, sign out, sign in with it, remove', async ({ page }) => {
  // Chromium's virtual WebAuthn authenticator: a resident key, the user verified, no prompt.
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('WebAuthn.enable');
  await cdp.send('WebAuthn.addVirtualAuthenticator', {
    options: {
      protocol: 'ctap2',
      transport: 'internal',
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
      automaticPresenceSimulation: true,
    },
  });
  const removeButtons = page.getByRole('button', { name: 'Remove' });

  await page.goto('/profile');
  await expect(page.getByText('No passkeys yet.')).toBeVisible();
  await page.getByRole('button', { name: 'Add a passkey' }).click();
  await expect(removeButtons).toHaveCount(1);

  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.getByRole('button', { name: 'Sign in with a passkey' }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.locator('.topbar-title')).toHaveText('Dashboard');

  await page.getByRole('navigation').getByRole('link', { name: 'Profile & forms' }).click();
  await removeButtons.click();
  await expect(page.getByText('No passkeys yet.')).toBeVisible();
});

test.describe('consent for an MCP client', () => {
  const redirectUri = 'http://localhost:6274/oauth/callback'; // the MCP Inspector's
  let authorizeUrl: string;

  test.beforeEach(async ({ db, page }) => {
    // A public client, as the Inspector registers itself (DCR): PKCE, no secret.
    const clientId = `e2e-client-${randomUUID()}`;
    await db.oauthClient.create({
      data: {
        id: randomUUID(),
        clientId,
        name: 'Made-up MCP client',
        redirectUris: [redirectUri],
        tokenEndpointAuthMethod: 'none',
        applicationType: 'native',
        grantTypes: ['authorization_code'],
        responseTypes: ['code'],
        scopes: ['openid'],
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });
    const challenge = createHash('sha256')
      .update(randomBytes(32).toString('base64url'))
      .digest('base64url');
    authorizeUrl = `${apiOrigin}/api/auth/oauth2/authorize?${new URLSearchParams({
      response_type: 'code',
      client_id: clientId,
      redirect_uri: redirectUri,
      scope: 'openid',
      state: 'xyz',
      code_challenge: challenge,
      code_challenge_method: 'S256',
    })}`;
    // Nothing listens on the client's port: answer in its place.
    await page.route(`${redirectUri}**`, (route) => route.fulfill({ body: 'the client' }));
  });

  test('Allow lands on the redirect_uri with a code', async ({ page }) => {
    await page.goto(authorizeUrl);
    await expect(
      page.getByRole('heading', { name: 'Made-up MCP client wants to use Job Search Copilot' }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Allow' }).click();
    await page.waitForURL(`${redirectUri}**`);
    const back = new URL(page.url());
    expect(back.searchParams.get('code')).toBeTruthy();
    expect(back.searchParams.get('state')).toBe('xyz');
  });

  test('Deny lands on the redirect_uri with access_denied', async ({ page }) => {
    await page.goto(authorizeUrl);
    await page.getByRole('button', { name: 'Deny' }).click();
    await page.waitForURL(`${redirectUri}**`);
    const back = new URL(page.url());
    expect(back.searchParams.get('error')).toBe('access_denied');
    expect(back.searchParams.get('code')).toBeNull();
  });
});
