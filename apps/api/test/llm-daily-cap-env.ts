import { testDatabaseUrl } from './postgres';

/**
 * Side-effect import for daily-cap Postgres specs. Must run before
 * `createApp` / `AppModule` so ConfigModule sees the URL, live director,
 * and a tiny `LLM_DAILY_MAX`.
 */
const url = testDatabaseUrl();
if (url !== undefined) {
  process.env.DATABASE_URL = url;
  process.env.DIRECT_URL = url;
}
process.env.DIRECTOR_MODE = 'live';
process.env.GOOGLE_API_KEY = 'test-google-key';
process.env.LLM_DAILY_MAX = '5';
process.env.NODE_ENV = 'test';
