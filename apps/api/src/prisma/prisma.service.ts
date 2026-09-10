import { createPrismaClient } from '@job-search-copilot/core';
import { Injectable, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../config/env.validation';

/**
 * Owns the app's single PrismaClient and ties its connection lifecycle to Nest's:
 * connect on module init, disconnect on shutdown (so `app.enableShutdownHooks()`
 * in main.ts actually drains the pool on SIGTERM instead of dropping connections).
 */
@Injectable()
export class PrismaService implements OnModuleInit, OnModuleDestroy {
  readonly client;

  constructor(config: ConfigService<Env, true>) {
    this.client = createPrismaClient(config.get('DATABASE_URL', { infer: true }));
  }

  async onModuleInit(): Promise<void> {
    await this.client.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.client.$disconnect();
  }
}
