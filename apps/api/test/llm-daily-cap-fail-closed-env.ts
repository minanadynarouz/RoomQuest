/**
 * Side-effect import for fail-closed daily-cap specs. Must run before
 * `AppModule` so ConfigModule sees live director, a dummy key, and no DB.
 */
process.env.DIRECTOR_MODE = 'live';
process.env.GOOGLE_API_KEY = 'test-google-key';
process.env.NODE_ENV = 'test';
delete process.env.DATABASE_URL;
delete process.env.DIRECT_URL;
delete process.env.LLM_DAILY_MAX;
