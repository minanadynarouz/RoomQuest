/** Default when `BASE_URL` / `--base-url` are omitted. */
export const DEFAULT_BASE_URL = 'http://localhost:3000';

export const CLIENT_VERSION = '0.0.1';

/** Fixture date mixed into the daily seed (`YYYY-MM-DD`). */
export const SMOKE_DATE = '2026-10-14';

/**
 * Vercel preview origin that matches `VERCEL_PREVIEW_ORIGIN` in
 * `apps/api/src/common/cors.ts` (same host used by the CORS unit tests).
 */
export const PREVIEW_ORIGIN =
  'https://feat-b02-api-roomquest-minanadynarouz.vercel.app';

export const REQUEST_TIMEOUT_MS = 15_000;
