/**
 * Director client - F-03
 *
 * Starts POST /api/v1/levels and the local generator together. Accepts the
 * API plan only if it arrives within the budget, parses as LevelResponse,
 * and passes local re-validation against the scanned graph. Otherwise uses
 * the local procedural plan. The player never sees an API error.
 */

import {
  LevelResponse,
  type LevelPlan,
  type SurfaceGraph,
} from '@roomquest/schema';
import { lastResortPlan, schemaValidate, stubGenerate } from './fallback.js';
import {
  DEFAULT_CLIENT_VERSION,
  DIRECTOR_BUDGET_MS,
  LEVELS_PATH,
  type DirectorClient,
  type DirectorClientOptions,
  type DirectorMode,
  type DirectorResult,
  type FallbackReason,
  type FetchLike,
  type RequestPlanOverrides,
} from './types.js';

function stripTrailingSlash(url: string): string {
  return url.endsWith('/') ? url.slice(0, -1) : url;
}

function formatLocalDate(d: Date): string {
  const year = String(d.getFullYear());
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function isAbortError(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'name' in err &&
    (err as { name: string }).name === 'AbortError'
  );
}

async function postLevels(
  fetchFn: FetchLike,
  url: string,
  body: unknown,
  headers: Record<string, string>,
  budgetMs: number
): Promise<
  { ok: true; payload: unknown } | { ok: false; reason: FallbackReason }
> {
  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort();
  }, budgetMs);

  try {
    const response = await fetchFn(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!response.ok) {
      return { ok: false, reason: 'http-error' };
    }

    try {
      const payload: unknown = await response.json();
      return { ok: true, payload };
    } catch {
      return { ok: false, reason: 'invalid-plan' };
    }
  } catch (err) {
    if (isAbortError(err)) {
      return { ok: false, reason: 'timeout' };
    }
    return { ok: false, reason: 'network' };
  } finally {
    clearTimeout(timer);
  }
}

function proceduralResult(
  plan: ReturnType<typeof lastResortPlan>,
  seed: string,
  latencyMs: number,
  reason: FallbackReason
): DirectorResult {
  return {
    plan,
    source: 'procedural',
    cacheKey: `procedural:${seed}`,
    promptVersion: 'local',
    latencyMs,
    repairs: [],
    usedFallback: true,
    fallbackReason: reason,
  };
}

/**
 * Create a director client. Fetch, generate, validate, and device id are
 * injected so `game/` stays testable without DOM or network.
 */
export function createDirectorClient(
  options: DirectorClientOptions
): DirectorClient {
  const fetchFn = options.fetch;
  const apiBaseUrl = stripTrailingSlash(options.apiBaseUrl);
  const deviceId = options.deviceId;
  const clientVersion = options.clientVersion ?? DEFAULT_CLIENT_VERSION;
  const generate = options.generate ?? stubGenerate;
  const validate = options.validate ?? schemaValidate;
  const defaultMode: DirectorMode = options.directorMode ?? 'live';
  const defaultTier = options.tier ?? 'normal';
  const budgetMs = options.budgetMs ?? DIRECTOR_BUDGET_MS;
  const nowMs = options.nowMs ?? (() => Date.now());

  async function requestPlan(
    graph: SurfaceGraph,
    overrides: RequestPlanOverrides = {}
  ): Promise<DirectorResult> {
    const started = nowMs();
    const mode = overrides.directorMode ?? defaultMode;
    const date = overrides.date ?? options.date ?? formatLocalDate(new Date());
    const seed = overrides.seed ?? options.seed ?? `${graph.roomHash}-${date}`;
    const tier = overrides.tier ?? defaultTier;
    const recentThemes = overrides.recentThemes ?? options.recentThemes;

    const genPromise = Promise.resolve().then(() =>
      generate(graph, seed, tier)
    );

    async function useGenerator(
      reason: FallbackReason
    ): Promise<DirectorResult> {
      let plan: LevelPlan;
      try {
        plan = await genPromise;
      } catch (err) {
        console.warn(
          '[director] generator failed, using last-resort plan',
          err
        );
        plan = lastResortPlan(graph, seed);
      }

      const valid = await validate(plan, graph);
      if (!valid.ok) {
        console.warn(
          '[director] generator plan failed local validation',
          valid.issues
        );
        plan = lastResortPlan(graph, seed);
      }

      const result = proceduralResult(plan, seed, nowMs() - started, reason);
      console.info(
        `[director] source=${result.source} latencyMs=${result.latencyMs} reason=${reason}`
      );
      return result;
    }

    if (mode === 'off') {
      return useGenerator('director-off');
    }
    if (mode === 'mock') {
      return useGenerator('director-mock');
    }

    const levelsUrl = `${apiBaseUrl}${LEVELS_PATH}`;
    const requestBody: Record<string, unknown> = {
      graph,
      date,
      tier,
    };
    if (recentThemes && recentThemes.length > 0) {
      requestBody.recentThemes = recentThemes;
    }

    const api = await postLevels(
      fetchFn,
      levelsUrl,
      requestBody,
      {
        'Content-Type': 'application/json',
        'X-Device-Id': deviceId,
        'X-Client-Version': clientVersion,
      },
      budgetMs
    );

    if (!api.ok) {
      return useGenerator(api.reason);
    }

    const parsed = LevelResponse.safeParse(api.payload);
    if (!parsed.success) {
      return useGenerator('invalid-plan');
    }

    const local = await validate(parsed.data.plan, graph);
    if (!local.ok) {
      return useGenerator('invalid-plan');
    }

    const latencyMs = nowMs() - started;
    if (latencyMs > budgetMs) {
      return useGenerator('timeout');
    }

    // Generator was already racing; ignore its result.
    void genPromise.catch(() => undefined);

    const result: DirectorResult = {
      plan: parsed.data.plan,
      source: parsed.data.source,
      cacheKey: parsed.data.cacheKey,
      model: parsed.data.model,
      promptVersion: parsed.data.promptVersion,
      latencyMs,
      repairs: parsed.data.repairs,
      usedFallback: false,
    };
    console.info(
      `[director] source=${result.source} latencyMs=${result.latencyMs}`
    );
    return result;
  }

  return { requestPlan };
}
