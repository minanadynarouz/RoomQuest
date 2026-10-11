import 'reflect-metadata';

/**
 * Vitest workers reuse a process. A developer/CI DATABASE_URL (or one set by
 * a previous file) would otherwise make every `/levels` test hit Postgres
 * and return `source:"cache"`. Cache specs opt back in via `test/cache-env.ts`.
 */
delete process.env.DATABASE_URL;
delete process.env.DIRECT_URL;

/**
 * Live-LLM safety ($10 Gemini billing cap): tests never see a real key and
 * never run the live director unless RQ_ALLOW_LIVE_LLM=1 is set explicitly.
 * Specs that need live-mode wiring pass a dummy key + fake factory.
 */
if (process.env.RQ_ALLOW_LIVE_LLM !== '1') {
  delete process.env.GOOGLE_API_KEY;
  delete process.env.GEMINI_API_KEY;
  process.env.DIRECTOR_MODE = 'mock';
}
