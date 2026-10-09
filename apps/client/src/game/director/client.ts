/**
 * Director client - F-03
 *
 * Starts POST /api/v1/levels and the local generator together. Accepts the
 * API plan only if it arrives within the budget, parses as LevelResponse,
 * and passes local re-validation against the scanned graph. An invalid
 * server plan is offered to `repairPlan` first; only if repair fails does
 * the client keep the racing `generatePlan` result. The player never sees
 * an API error.
 */

import {
  clampParTimeMs,
  generatePlan,
  repairPlan,
  validatePlan,
  type Issue,
} from '@roomquest/level-core';
import {
  ApiError,
  LevelResponse,
  type ErrorCode,
  type LevelPlan,
  type PlanSource,
  type SurfaceGraph,
} from '@roomquest/schema';
import { fallbackReasonFromIssues, issueCodesOf } from './issues.js';
import {
  DEFAULT_CLIENT_VERSION,
  DEFAULT_TIER,
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

function clampPlanPar(plan: LevelPlan): LevelPlan {
  const parTimeMs = clampParTimeMs(plan.parTimeMs);
  if (parTimeMs === plan.parTimeMs) {
    return plan;
  }
  return { ...plan, parTimeMs };
}

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

interface PostFailure {
  ok: false;
  reason: FallbackReason;
  apiErrorCode?: ErrorCode;
}

async function readJson(response: Pick<Response, 'json'>): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return undefined;
  }
}

function parseApiError(payload: unknown): ErrorCode | undefined {
  const parsed = ApiError.safeParse(payload);
  if (!parsed.success) {
    return undefined;
  }
  return parsed.data.error.code;
}

async function postLevels(
  fetchFn: FetchLike,
  url: string,
  body: unknown,
  headers: Record<string, string>,
  budgetMs: number
): Promise<{ ok: true; payload: unknown } | PostFailure> {
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

    const payload = await readJson(response);

    if (!response.ok) {
      const apiErrorCode = parseApiError(payload);
      if (apiErrorCode) {
        return { ok: false, reason: 'api-error', apiErrorCode };
      }
      return { ok: false, reason: 'http-error' };
    }

    if (payload === undefined) {
      return { ok: false, reason: 'invalid-plan' };
    }

    return { ok: true, payload };
  } catch (err) {
    if (isAbortError(err)) {
      return { ok: false, reason: 'timeout' };
    }
    return { ok: false, reason: 'network' };
  } finally {
    clearTimeout(timer);
  }
}

function localResult(
  plan: LevelPlan,
  seed: string,
  latencyMs: number,
  source: PlanSource,
  reason: FallbackReason,
  extras?: {
    apiErrorCode?: ErrorCode;
    issues?: Issue[];
    repairs?: string[];
    cacheKey?: string;
    model?: string;
    promptVersion?: string;
  }
): DirectorResult {
  return {
    plan: clampPlanPar(plan),
    source,
    cacheKey: extras?.cacheKey ?? `procedural:${seed}`,
    model: extras?.model,
    promptVersion: extras?.promptVersion ?? 'local',
    latencyMs,
    repairs: extras?.repairs ?? [],
    usedFallback: true,
    fallbackReason: reason,
    apiErrorCode: extras?.apiErrorCode,
    issues: extras?.issues ?? [],
  };
}

function logDirectorResult(result: DirectorResult): void {
  const reason = result.fallbackReason
    ? ` reason=${result.fallbackReason}`
    : '';
  const code = result.apiErrorCode ? ` apiError=${result.apiErrorCode}` : '';
  const issueCodes = result.issues?.length
    ? ` issues=${issueCodesOf(result.issues).join(',')}`
    : '';
  console.info(
    `[director] source=${result.source} latencyMs=${result.latencyMs}${reason}${code}${issueCodes}`
  );
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
  const generate = options.generate ?? generatePlan;
  const validate = options.validate ?? validatePlan;
  const repair = options.repair ?? repairPlan;
  const defaultMode: DirectorMode = options.directorMode ?? 'live';
  const defaultTier = options.tier ?? DEFAULT_TIER;
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
    const generateOptions =
      recentThemes && recentThemes.length > 0 ? { recentThemes } : undefined;

    const genPromise = Promise.resolve().then(() =>
      generate(graph, seed, tier, generateOptions)
    );

    async function useGenerator(
      reason: FallbackReason,
      extras?: { apiErrorCode?: ErrorCode; issues?: Issue[] }
    ): Promise<DirectorResult> {
      let plan: LevelPlan;
      try {
        plan = await genPromise;
      } catch (err) {
        console.warn(
          '[director] generator failed, using generatePlan last resort',
          err
        );
        plan = generatePlan(graph, seed, tier, generateOptions);
      }

      const result = localResult(
        plan,
        seed,
        nowMs() - started,
        'procedural',
        reason,
        extras
      );
      logDirectorResult(result);
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
      return useGenerator(api.reason, { apiErrorCode: api.apiErrorCode });
    }

    const parsed = LevelResponse.safeParse(api.payload);
    if (!parsed.success) {
      return useGenerator('invalid-plan');
    }

    // B-02 mock plans use fixture surface ids, not the scanned graph.
    // `validatePlan` reports UNKNOWN_SURFACE; try `repairPlan` first, then
    // `generatePlan`. Fixture-id mismatch stays `graph-mismatch` (info).
    const local = await validate(parsed.data.plan, graph);
    if (!local.ok) {
      const repaired = await repair(parsed.data.plan, graph);
      if (repaired.result.ok) {
        const latencyMs = nowMs() - started;
        if (latencyMs > budgetMs) {
          return useGenerator('timeout', { issues: local.issues });
        }
        void genPromise.catch(() => undefined);
        const result = localResult(
          repaired.plan,
          seed,
          latencyMs,
          'llm_repaired',
          'repaired',
          {
            issues: local.issues,
            repairs: repaired.repairs,
            cacheKey: parsed.data.cacheKey,
            model: parsed.data.model,
            promptVersion: parsed.data.promptVersion,
          }
        );
        logDirectorResult(result);
        return result;
      }
      const reason = fallbackReasonFromIssues(local.issues);
      return useGenerator(reason, { issues: local.issues });
    }

    const latencyMs = nowMs() - started;
    if (latencyMs > budgetMs) {
      return useGenerator('timeout');
    }

    // Generator was already racing; ignore its result.
    void genPromise.catch(() => undefined);

    const result: DirectorResult = {
      plan: clampPlanPar(parsed.data.plan),
      source: parsed.data.source,
      cacheKey: parsed.data.cacheKey,
      model: parsed.data.model,
      promptVersion: parsed.data.promptVersion,
      latencyMs,
      repairs: parsed.data.repairs,
      usedFallback: false,
      issues: [],
    };
    logDirectorResult(result);
    return result;
  }

  return { requestPlan };
}
