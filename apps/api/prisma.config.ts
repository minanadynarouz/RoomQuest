import 'dotenv/config';
import { defineConfig } from 'prisma/config';

/**
 * Local Docker Postgres 17 (see docker-compose.yml). Used when DIRECT_URL
 * and DATABASE_URL are unset so `prisma generate` still works in CI.
 */
const LOCAL_DATABASE_URL =
  'postgresql://postgres:postgres@localhost:5432/roomquest';

const directUrl =
  process.env.DIRECT_URL ?? process.env.DATABASE_URL ?? LOCAL_DATABASE_URL;

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    // CLI (migrate / introspect) uses the direct/unpooled URL.
    // Runtime Prisma Client uses DATABASE_URL via the driver adapter.
    url: directUrl,
  },
});
