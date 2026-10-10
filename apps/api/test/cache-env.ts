import { testDatabaseUrl } from './postgres';

/**
 * Side-effect import for cache integration tests. Must be imported before
 * `createApp` / `AppModule` so ConfigModule sees the postgres URL and live
 * director (no LLM key → generatePlan).
 */
const url = testDatabaseUrl();
if (url !== undefined) {
  process.env.DATABASE_URL = url;
  process.env.DIRECT_URL = url;
}
process.env.DIRECTOR_MODE = 'live';
delete process.env.GOOGLE_API_KEY;
process.env.NODE_ENV = 'test';
