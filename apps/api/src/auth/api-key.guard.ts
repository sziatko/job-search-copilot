import { type CommentSource, verifyApiKey } from '@job-search-copilot/core';
import {
  type CanActivate,
  createParamDecorator,
  type ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import { PrismaService } from '../prisma/prisma.service';

/** The global AuthGuard leaves `session` and `user` on the request; this guard, `apiKeyOwner`. */
type AuthedRequest = Request & {
  session?: unknown;
  user?: { id: string } | null;
  apiKeyOwner?: string;
};

/**
 * n8n's and scripts' way in (ADR-0039): a session, else `Authorization: Bearer jsc_…`,
 * a key from /profile. Pair it with `@AllowAnonymous()` — the global AuthGuard runs
 * first and would 401 a key; with it, that guard only looks the session up.
 * Set on each domain controller's class, so a new controller stays closed to keys.
 */
@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<AuthedRequest>();
    if (req.session) return true;

    const [scheme, key] = (req.headers.authorization ?? '').split(' ');
    const owner = scheme === 'Bearer' && key ? await verifyApiKey(this.prisma.client, key) : null;
    if (!owner) throw new UnauthorizedException();
    req.apiKeyOwner = owner;
    return true;
  }
}

/** The caller's user id: the session's user, else the owner of the key `ApiKeyGuard` took. */
export const CurrentUserId = createParamDecorator((_: unknown, context: ExecutionContext) => {
  const req = context.switchToHttp().getRequest<AuthedRequest>();
  const id = req.user?.id ?? req.apiKeyOwner;
  // Only on an @AllowAnonymous() route without ApiKeyGuard — a wiring mistake, not a 500.
  if (!id) throw new UnauthorizedException();
  return id;
});

/** Who a comment written by this request is from: a session → USER, a key → AGENT. */
export const CallerSource = createParamDecorator(
  (_: unknown, context: ExecutionContext): CommentSource =>
    context.switchToHttp().getRequest<AuthedRequest>().user ? 'USER' : 'AGENT',
);
