import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';

/**
 * Build a PrismaClient bound to an explicit Postgres URL.
 *
 * Prisma 7 no longer reads the connection string from schema.prisma at runtime — the
 * client needs a "driver adapter" instead. This wraps node-postgres (pg). The caller
 * owns the returned client's lifecycle ($connect / $disconnect).
 */
export function createPrismaClient(databaseUrl: string): PrismaClient {
  return new PrismaClient({ adapter: new PrismaPg(databaseUrl) });
}

function requireDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error('DATABASE_URL is not set');
  }
  return url;
}

let defaultClient: PrismaClient | undefined;

/**
 * Lazily-created process-wide client for entrypoints without a DI container (the MCP
 * server). Created on first call — not at import — so importing this package has no
 * side effects and never throws just for being loaded before env vars are set.
 * Nest code depends on PrismaService instead.
 */
export function getPrisma(): PrismaClient {
  if (!defaultClient) {
    defaultClient = createPrismaClient(requireDatabaseUrl());
  }
  return defaultClient;
}
