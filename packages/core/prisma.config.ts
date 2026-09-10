import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  datasource: {
    // Only required for `migrate`/`studio`/`db push`. Left undefined-safe so `prisma generate`
    // keeps working in contexts (like a Docker build step) where DATABASE_URL isn't set.
    url: process.env.DATABASE_URL,
  },
});
