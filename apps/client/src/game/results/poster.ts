/**
 * Fire-and-forget session result poster (F-07).
 *
 * POST /api/v1/levels/:levelKey/result with the F-03 director headers.
 * Uses `@roomquest/schema` (`procLevelKey`, `ResultLevelKey`, `ResultRequest`).
 * Network errors, 202 {stored:false}, 400, 404, and 429 never throw and
 * never affect callers. Invalid bodies are skipped (no fetch).
 *
 * Posts even in `?director=off` — failures stay silent.
 */

import {
  RESULT_TIME_MS_MAX,
  ResultLevelKey,
  ResultRequest,
  isProcLevelKey,
  procLevelKey,
  type PlanSource,
  type Tier,
} from '@roomquest/schema';
import {
  DEFAULT_CLIENT_VERSION,
  DEFAULT_TIER,
  LEVELS_PATH,
} from '../director/types.js';

export const RESULT_PATH_SUFFIX = '/result';

export type ResultFetch = (
  input: string,
  init: {
    method: string;
    headers: Record<string, string>;
    body: string;
  }
) => Promise<Pick<Response, 'ok' | 'status' | 'json'>>;

export interface ResolveLevelKeyInput {
  /** `LevelResponse.source` / store `planSource`. */
  planSource: PlanSource | null;
  /** Cache key from a server `LevelResponse`, if any. */
  cacheKey: string | null | undefined;
  /** Seed passed to `generatePlan` (usually `plan.seed`). */
  seed: string | number | null | undefined;
  tier?: Tier | null;
}

export interface PostLevelResultInput {
  levelKey: string;
  deviceId: string;
  stars: number;
  gems: number;
  timeMs: number;
  completed: boolean;
  planSource: PlanSource;
}

export interface ResultPosterOptions {
  fetch: ResultFetch;
  apiBaseUrl: string;
  deviceId: string;
  clientVersion?: string;
}

function stripTrailingSlash(url: string): string {
  return url.endsWith('/') ? url.slice(0, -1) : url;
}

function clampTimeMs(timeMs: number): number {
  if (!Number.isFinite(timeMs)) return 1;
  const rounded = Math.round(timeMs);
  if (rounded < 1) return 1;
  if (rounded > RESULT_TIME_MS_MAX) return RESULT_TIME_MS_MAX;
  return rounded;
}

/**
 * Server levels use the `LevelResponse.cacheKey`. Client procedural
 * fallback (including director=off/mock) uses `proc:<seed>:<tier>` and
 * `planSource: "procedural"`.
 */
export function resolveLevelKey(input: ResolveLevelKeyInput): string | null {
  if (input.planSource === 'procedural' || input.planSource === null) {
    if (input.seed === null || input.seed === undefined || input.seed === '') {
      return null;
    }
    try {
      return procLevelKey(input.seed, input.tier ?? DEFAULT_TIER);
    } catch {
      return null;
    }
  }
  if (typeof input.cacheKey === 'string' && input.cacheKey.length > 0) {
    return input.cacheKey;
  }
  return null;
}

export interface ResultPoster {
  post(input: PostLevelResultInput): Promise<void>;
}

/**
 * Create a silent result poster. Always resolves; never throws.
 */
export function createResultPoster(options: ResultPosterOptions): ResultPoster {
  const fetchFn = options.fetch;
  const apiBaseUrl = stripTrailingSlash(options.apiBaseUrl);
  const deviceId = options.deviceId;
  const clientVersion = options.clientVersion ?? DEFAULT_CLIENT_VERSION;

  async function post(input: PostLevelResultInput): Promise<void> {
    const keyParsed = ResultLevelKey.safeParse(input.levelKey);
    if (!keyParsed.success) return;

    const planSource: PlanSource = isProcLevelKey(keyParsed.data)
      ? 'procedural'
      : input.planSource;

    const bodyParsed = ResultRequest.safeParse({
      deviceId: input.deviceId || deviceId,
      stars: input.stars,
      gems: input.gems,
      timeMs: clampTimeMs(input.timeMs),
      completed: input.completed,
      planSource,
    });
    if (!bodyParsed.success) return;

    const url = `${apiBaseUrl}${LEVELS_PATH}/${encodeURIComponent(keyParsed.data)}${RESULT_PATH_SUFFIX}`;

    try {
      await fetchFn(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Device-Id': bodyParsed.data.deviceId,
          'X-Client-Version': clientVersion,
        },
        body: JSON.stringify(bodyParsed.data),
      });
    } catch {
      // Fire-and-forget: network / 202 / 400 / 404 / 429 must not surface.
    }
  }

  return { post };
}
