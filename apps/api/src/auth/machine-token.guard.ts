import { timingSafeEqual } from 'node:crypto';
import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import type { Env } from '../config/env.validation';

/**
 * n8n's way in (ADR-0036): `Authorization: Bearer <INTAKE_TOKEN>`, or a session.
 * Pair it with `@AllowAnonymous()` — the global AuthGuard runs first and would 401 n8n;
 * with it, that guard only looks the session up and leaves it on `req.session`.
 * Write routes only: on a read route the token becomes a key to all the data.
 */
@Injectable()
export class MachineTokenGuard implements CanActivate {
  private readonly token: Buffer;

  constructor(config: ConfigService<Env, true>) {
    this.token = Buffer.from(config.get('INTAKE_TOKEN', { infer: true }));
  }

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request & { session?: unknown }>();
    if (req.session) return true;

    const [scheme, value = ''] = (req.headers.authorization ?? '').split(' ');
    const given = Buffer.from(value);
    // timingSafeEqual throws on unequal lengths; the length itself is not the secret.
    if (
      scheme === 'Bearer' &&
      given.length === this.token.length &&
      timingSafeEqual(given, this.token)
    ) {
      return true;
    }
    throw new UnauthorizedException();
  }
}
