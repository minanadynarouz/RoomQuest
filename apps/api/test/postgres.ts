import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';

/**
 * Postgres URL for cache integration tests. CI sets TEST_DATABASE_URL from
 * the postgres:17 service. Locally, Docker Compose or TEST_DATABASE_URL.
 */
export function testDatabaseUrl(): string | undefined {
  const url = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
  if (url === undefined || url.trim().length === 0) {
    return undefined;
  }
  return url;
}

export function apiRoot(): string {
  const cwd = process.cwd();
  if (existsSync(path.join(cwd, 'prisma', 'schema.prisma'))) {
    return cwd;
  }
  return path.resolve(cwd, 'apps/api');
}

export function migrateTestDatabase(url: string): void {
  execFileSync('pnpm', ['exec', 'prisma', 'migrate', 'deploy'], {
    cwd: apiRoot(),
    env: {
      ...process.env,
      DATABASE_URL: url,
      DIRECT_URL: url,
    },
    stdio: 'pipe',
  });
}
