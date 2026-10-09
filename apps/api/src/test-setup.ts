import 'reflect-metadata';

/**
 * Vitest workers reuse a process. A developer/CI DATABASE_URL (or one set by
 * a previous file) would otherwise make every `/levels` test hit Postgres
 * and return `source:"cache"`. Cache specs opt back in via `test/cache-env.ts`.
 */
delete process.env.DATABASE_URL;
delete process.env.DIRECT_URL;
