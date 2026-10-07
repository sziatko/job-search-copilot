import type { Auth } from '@job-search-copilot/core';
import { Controller, Get, VERSION_NEUTRAL } from '@nestjs/common';
import { AllowAnonymous, AuthService } from '@thallesp/nestjs-better-auth';

/**
 * The authorization server's metadata (RFC 8414) where an MCP client looks for it. The
 * issuer is `${BETTER_AUTH_URL}/api/auth`, and RFC 8414 puts an issuer's metadata at the
 * root, its path appended; Better Auth serves only what is under /api/auth. Excluded from
 * the /api prefix (setup-app.ts), version-neutral, anonymous: a client reads it before it
 * has anything to sign in with.
 */
@AllowAnonymous()
@Controller({ path: '.well-known', version: VERSION_NEUTRAL })
export class WellKnownController {
  constructor(private readonly auth: AuthService<Auth>) {}

  @Get('oauth-authorization-server/api/auth')
  authorizationServer() {
    return this.auth.api.getOAuthServerConfig();
  }
}
