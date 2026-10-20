import { assertLiveLlmAllowed, TEST_DUMMY_KEY_PREFIX } from './models';
import type { DirectorLogger } from './telemetry';

/** Gemini REST base for the non-generation metadata call. */
export const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta';
export const WARMUP_TIMEOUT_MS = 5_000;

export type WarmupResult = 'ok' | 'failed' | 'skipped';

export interface WarmupInput {
  model: string;
  apiKey: string;
  logger: Pick<DirectorLogger, 'log' | 'warn'>;
  fetchImpl?: typeof fetch;
  env?: NodeJS.ProcessEnv;
  timeoutMs?: number;
  now?: () => number;
}

/**
 * `DIRECTOR_WARMUP` resolution: explicit on/off wins; unset means on only
 * when DIRECTOR_MODE=live and a GOOGLE_API_KEY is configured.
 */
export function warmupEnabled(
  setting: boolean | undefined,
  mode: string,
  apiKey: string | undefined
): boolean {
  const configured = mode === 'live' && apiKey !== undefined && apiKey.length > 0;
  return configured && (setting ?? true);
}

/**
 * Never in tests / CI / smoke: Vitest or NODE_ENV=test, CI=true, dummy
 * `test-*` keys, or the assertLiveLlmAllowed guard — unless RQ_ALLOW_LIVE_LLM=1.
 */
export function warmupBlockedReason(
  apiKey: string,
  env: NodeJS.ProcessEnv = process.env
): string | null {
  if (env.RQ_ALLOW_LIVE_LLM === '1') return null;
  if (env.VITEST !== undefined || env.NODE_ENV === 'test') return 'test';
  if (env.CI !== undefined && env.CI !== '' && env.CI !== 'false') return 'ci';
  if (apiKey.startsWith(TEST_DUMMY_KEY_PREFIX)) return 'dummy-key';
  try {
    assertLiveLlmAllowed(apiKey, env);
  } catch {
    return 'live-guard';
  }
  return null;
}

/**
 * One background `models.get` for the configured model so the first TLS
 * handshake / DNS lookup to Gemini happens at boot, not on a user's
 * request. Not a generation call: it does not touch LLM_DAILY_MAX or the
 * quota breaker. Never throws; logs exactly one line.
 */
export async function warmUpGemini(input: WarmupInput): Promise<WarmupResult> {
  const env = input.env ?? process.env;
  const blocked = warmupBlockedReason(input.apiKey, env);
  if (blocked !== null) {
    input.logger.log(`director.warmup skipped reason=${blocked}`);
    return 'skipped';
  }
  const now = input.now ?? (() => Date.now());
  const started = now();
  const fetchImpl = input.fetchImpl ?? fetch;
  try {
    const res = await fetchImpl(
      `${GEMINI_API_BASE}/models/${encodeURIComponent(input.model)}`,
      {
        method: 'GET',
        headers: { 'x-goog-api-key': input.apiKey },
        signal: AbortSignal.timeout(input.timeoutMs ?? WARMUP_TIMEOUT_MS),
      }
    );
    const ms = Math.max(0, now() - started);
    if (!res.ok) {
      input.logger.warn(
        `director.warmup failed status=${String(res.status)} ms=${String(ms)}`
      );
      return 'failed';
    }
    input.logger.log(`director.warmup ok model=${input.model} ms=${String(ms)}`);
    return 'ok';
  } catch (error) {
    const message = error instanceof Error ? error.name : 'error';
    input.logger.warn(
      `director.warmup failed error=${message} ms=${String(Math.max(0, now() - started))}`
    );
    return 'failed';
  }
}
