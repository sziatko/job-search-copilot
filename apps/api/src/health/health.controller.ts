import {
  Controller,
  Get,
  Logger,
  ServiceUnavailableException,
  VERSION_NEUTRAL,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Liveness + DB readiness in one endpoint. Kept hand-rolled rather than pulling in
 * @nestjs/terminus — a single `SELECT 1` is all this app needs, and docker-compose
 * points its healthcheck here so `api` only reports healthy once Postgres answers.
 */
// Excluded from the /api prefix (setup-app.ts) and version-neutral: infra hits a
// stable /health, not /api/v1/health.
@Controller({ path: 'health', version: VERSION_NEUTRAL })
export class HealthController {
  private readonly logger = new Logger(HealthController.name);

  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async check(): Promise<{ status: 'ok'; db: 'up' }> {
    try {
      await this.prisma.client.$queryRaw`SELECT 1`;
    } catch (err) {
      this.logger.error(
        'Health check failed: database unreachable',
        err instanceof Error ? err.stack : String(err),
      );
      throw new ServiceUnavailableException({ status: 'error', db: 'down' });
    }
    return { status: 'ok', db: 'up' };
  }
}
