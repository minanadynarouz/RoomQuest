/**
 * Director client - F-03
 *
 * Starts POST /api/v1/levels and the local generator together. Accepts the
 * API plan only if it arrives within the budget, parses as LevelResponse,
 * and passes local re-validation against the scanned graph. An invalid
 * server plan is offered to `repairPlan` first; only if repair fails does
 * the client keep the racing `generatePlan` result. HTTP 429 is a silent
 * `generatePlan` fallback (`fallbackReason: 'rate-limited'`); later live
 * requests in this session skip the network until `retryAfterS` expires.
 * The player never sees an API error.
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
  type Tier,
} from '@roomquest/schema';
import { fallbackReasonFromIssues, issueCodesOf } from './issues.js';
import {
  cooldownUntilMs,
  parseRetryAfterHeader,
  parseRetryAfterS,
  remainingRetryAfterS,
} from './rate-limit.js';
import {
  DIRECTOR_COLD_START_BUDGET_MS,
  shouldUseColdStartBudget,
} from './health-prewarm.js';
import {
  DEFAULT_CLIENT_VERSION,
  DEFAULT_TIER,
  DIRECTOR_BUDGET_MS,
  LEVELS_PATH,
  type DirectorClient,
  type DirectorClientOptions,
  type DirectorMode,
  type DirectorRequestEndInfo,
  type DirectorResult,
  type FallbackReason,
  type FetchHeadersLike,
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

/**
 * JSON round-trip of the scanned graph. POST and local re-validation must
 * use this snapshot: SurfaceGraphSystem may keep mutating the caller's
 * object as planes/meshes arrive, and node ids are rank-based `s1`..`s12`.
 */
export function snapshotSurfaceGraph(graph: SurfaceGraph): SurfaceGraph {
  try {
    return JSON.parse(JSON.stringify(graph)) as SurfaceGraph;
  } catch {
    return graph;
  }
}

function logGraphDrift(current: SurfaceGraph, posted: SurfaceGraph): void {
  try {
    if (JSON.stringify(current) === JSON.stringify(posted)) {
      return;
    }
  } catch {
    return;
  }
  console.info(
    '[director] scanned graph changed during request; validating posted snapshot',
    { posted, current }
  );
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
  retryAfterS?: number;
  requestId?: string;
}

function readResponseHeader(
  headers: FetchHeadersLike | undefined,
  name: string
): string | undefined {
  try {
    const value = headers?.get(name)?.trim();
    return value && value.length > 0 ? value : undefined;
  } catch {
    // Forbidden header (CORS has not exposed it yet) or missing Headers.
    return undefined;
  }
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
  budgetMs: number,
  timeoutReason: FallbackReason = 'timeout',
  nowMs: () => number = () => Date.now()
): Promise<
  { ok: true; payload: unknown; requestId?: string } | PostFailure
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

    const payload = await readJson(response);
    const requestId = readResponseHeader(response.headers, 'X-Request-Id');

    if (response.status === 429) {
      const retryAfterS =
        parseRetryAfterHeader(
          readResponseHeader(response.headers, 'Retry-After'),
          nowMs()
        ) ?? parseRetryAfterS(payload);
      return {
        ok: false,
        reason: 'rate-limited',
        apiErrorCode: parseApiError(payload),
        retryAfterS,
        requestId,
      };
    }

    if (!response.ok) {
      const apiErrorCode = parseApiError(payload);
      if (apiErrorCode === 'ROOM_UNPLAYABLE') {
        return { ok: false, reason: 'room-unplayable', apiErrorCode, requestId };
      }
      if (apiErrorCode) {
        return { ok: false, reason: 'api-error', apiErrorCode, requestId };
      }
      return { ok: false, reason: 'http-error', requestId };
    }

    if (payload === undefined) {
      return { ok: false, reason: 'invalid-plan', requestId };
    }

    return { ok: true, payload, requestId };
  } catch (err) {
    if (isAbortError(err)) {
      return { ok: false, reason: timeoutReason };
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
    retryAfterS?: number;
    issues?: Issue[];
    repairs?: string[];
    cacheKey?: string;
    model?: string;
    promptVersion?: string;
    tier?: Tier;
    requestId?: string;
  }
): DirectorResult {
  return {
    plan: clampPlanPar(plan),
    source,
    cacheKey: extras?.cacheKey ?? `procedural:${seed}`,
    tier: extras?.tier,
    model: extras?.model,
    promptVersion: extras?.promptVersion ?? 'local',
    latencyMs,
    repairs: extras?.repairs ?? [],
    usedFallback: true,
    fallbackReason: reason,
    apiErrorCode: extras?.apiErrorCode,
    retryAfterS: extras?.retryAfterS,
    issues: extras?.issues ?? [],
    requestId: extras?.requestId,
  };
}

function logDirectorResult(result: DirectorResult): void {
  const reason = result.fallbackReason
    ? ` reason=${result.fallbackReason}`
    : '';
  const code = result.apiErrorCode ? ` apiError=${result.apiErrorCode}` : '';
  const retry =
    result.retryAfterS !== undefined ? ` retryAfterS=${result.retryAfterS}` : '';
  const issueCodes = result.issues?.length
    ? ` issues=${issueCodesOf(result.issues).join(',')}`
    : '';
  console.info(
    `[director] source=${result.source} latencyMs=${result.latencyMs}${reason}${code}${retry}${issueCodes}`
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
  const coldStartBudgetMs =
    options.coldStartBudgetMs ?? DIRECTOR_COLD_START_BUDGET_MS;
  const isHealthPrewarmPending =
    options.isHealthPrewarmPending ?? shouldUseColdStartBudget;
  const nowMs = options.nowMs ?? (() => Date.now());
  let skipUntilMs: number | undefined;
  let usedColdStartBudget = false;

  function finish(result: DirectorResult): DirectorResult {
    const info: DirectorRequestEndInfo = {
      status: result.usedFallback ? 'fallback' : 'resolved',
      source: result.usedFallback ? 'procedural' : 'llm',
      fallbackReason: result.fallbackReason,
      requestId: result.requestId,
    };
    options.onRequestEnd?.(info);
    return result;
  }

  async function requestPlan(
    graph: SurfaceGraph,
    overrides: RequestPlanOverrides = {}
  ): Promise<DirectorResult> {
    const postedGraph = snapshotSurfaceGraph(graph);
    const started = nowMs();
    const mode = overrides.directorMode ?? defaultMode;
    const date = overrides.date ?? options.date ?? formatLocalDate(new Date());
    const seed =
      overrides.seed ?? options.seed ?? `${postedGraph.roomHash}-${date}`;
    const tier = overrides.tier ?? defaultTier;
    const recentThemes = overrides.recentThemes ?? options.recentThemes;
    const generateOptions =
      recentThemes && recentThemes.length > 0 ? { recentThemes } : undefined;

    const genPromise = Promise.resolve().then(() =>
      generate(postedGraph, seed, tier, generateOptions)
    );

    async function useGenerator(
      reason: FallbackReason,
      extras?: {
        apiErrorCode?: ErrorCode;
        retryAfterS?: number;
        issues?: Issue[];
        requestId?: string;
      }
    ): Promise<DirectorResult> {
      let plan: LevelPlan;
      try {
        plan = await genPromise;
      } catch (err) {
        console.warn(
          '[director] generator failed, using generatePlan last resort',
          err
        );
        plan = generatePlan(postedGraph, seed, tier, generateOptions);
      }

      const result = localResult(
        plan,
        seed,
        nowMs() - started,
        'procedural',
        reason,
        { ...extras, tier }
      );
      logDirectorResult(result);
      return finish(result);
    }

    if (mode === 'off') {
      return useGenerator('director-off');
    }
    if (mode === 'mock') {
      return useGenerator('director-mock');
    }

    const remainingS = remainingRetryAfterS(nowMs(), skipUntilMs);
    if (remainingS !== undefined) {
      return useGenerator('rate-limited', { retryAfterS: remainingS });
    }

    const levelsUrl = `${apiBaseUrl}${LEVELS_PATH}`;
    const requestBody: Record<string, unknown> = {
      graph: postedGraph,
      date,
      tier,
    };
    if (recentThemes && recentThemes.length > 0) {
      requestBody.recentThemes = recentThemes;
    }

    const useColdStart = !usedColdStartBudget && isHealthPrewarmPending();
    if (useColdStart) {
      usedColdStartBudget = true;
    }
    const requestBudgetMs = useColdStart ? coldStartBudgetMs : budgetMs;
    const timeoutReason: FallbackReason = useColdStart
      ? 'cold-start-timeout'
      : 'timeout';

    options.onRequestStart?.();
    const api = await postLevels(
      fetchFn,
      levelsUrl,
      requestBody,
      {
        'Content-Type': 'application/json',
        'X-Device-Id': deviceId,
        'X-Client-Version': clientVersion,
      },
      requestBudgetMs,
      timeoutReason,
      nowMs
    );

    if (!api.ok) {
      if (api.reason === 'rate-limited' && api.retryAfterS !== undefined) {
        skipUntilMs = cooldownUntilMs(nowMs(), api.retryAfterS);
      }
      return useGenerator(api.reason, {
        apiErrorCode: api.apiErrorCode,
        retryAfterS: api.retryAfterS,
        requestId: api.requestId,
      });
    }

    const parsed = LevelResponse.safeParse(api.payload);
    if (!parsed.success) {
      return useGenerator('invalid-plan', { requestId: api.requestId });
    }

    logGraphDrift(graph, postedGraph);

    // Re-validate against the POSTed snapshot, not a later rebuild of
    // `graph`. B-02 mock plans still use fixture ids → UNKNOWN_SURFACE →
    // repair, then generatePlan; that mismatch stays `graph-mismatch`.
    const local = await validate(parsed.data.plan, postedGraph);
    if (!local.ok) {
      const repaired = await repair(parsed.data.plan, postedGraph);
      if (repaired.result.ok) {
        const latencyMs = nowMs() - started;
        if (latencyMs > requestBudgetMs) {
          return useGenerator(timeoutReason, {
            issues: local.issues,
            requestId: api.requestId,
          });
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
            tier,
            requestId: api.requestId,
          }
        );
        logDirectorResult(result);
        return finish(result);
      }
      const reason = fallbackReasonFromIssues(local.issues);
      return useGenerator(reason, {
        issues: local.issues,
        requestId: api.requestId,
      });
    }

    const latencyMs = nowMs() - started;
    if (latencyMs > requestBudgetMs) {
      return useGenerator(timeoutReason, { requestId: api.requestId });
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
      tier,
      requestId: api.requestId,
    };
    logDirectorResult(result);
    return finish(result);
  }

  return { requestPlan };
}
