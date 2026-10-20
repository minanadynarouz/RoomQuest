import { performance } from 'node:perf_hooks';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import {
  hedgedInvoke,
  type HedgeCallRecord,
  type HedgeOptions,
  type HedgeTrace,
} from './hedge';
import {
  applyDecoration,
  candidateRoutes,
  generatePlan,
  repairPlan,
  validatePlan,
  type Issue,
} from '@roomquest/level-core';
import {
  LevelResponse,
  type FallbackReason,
  type LevelPlan,
  type LevelRequest,
  type RelaxedRule,
} from '@roomquest/schema';
import { makeCacheKey } from '../levels/cache-key';
import { makeDailySeed } from '../levels/daily-seed';
import { createDirectorDeadline } from './deadline';
import {
  DEFAULT_DIRECTOR_PLACEMENT,
  LLM_REPAIR_MIN_REMAINING_MS,
  type DirectorPlacementMode,
} from './director.constants';
import { isTimeoutError } from './errors';
import {
  emptyValidationTrace,
  traceIssues,
  type DirectorFailurePoint,
  type DirectorStage,
  type RepairStage,
  type ValidationTrace,
} from './issue-trace';
import { localRepairPlan } from './local-repair';
import { buildDecorationMessages, decorationEnums } from './prompts/decoration';
import {
  countBannedWordHits,
  parseRouteDecoration,
  routeCallOptions,
  toLangchainMessages,
} from './route-arm';
import { expandSlimCandidate, tryParseLlmPlan } from './parse-plan';
import {
  buildRepairMessage,
  buildUserMessage,
  PROMPT_VERSION,
  SYSTEM_PREFIX,
} from './prompts';
import { isQuotaError, type LlmQuotaBreaker } from './quota-breaker';
import {
  buildSlotRequestContext,
  resolveSlotCandidate,
  type SlotRequestContext,
} from './slot-placement';
import {
  structuredCandidate,
  textFromRaw,
  type StructuredChat,
} from './structured-chat';
import {
  logLlmCall,
  promptCharCount,
  tokensFromRaw,
  type DirectorLogger,
  type LlmCallOutcome,
  type LlmCallTelemetry,
} from './telemetry';

export interface DirectorOutcome {
  response: LevelResponse;
  telemetry: LlmCallTelemetry[];
  validation: ValidationTrace;
  repairedBy: RepairStage | null;
  /**
   * Stage that produced the returned plan: `first-try`, a local stage
   * (`snap` / `repair-route` / `repair-plan`), `llm-repair`, or `procedural`.
   */
  stage: DirectorStage;
  /** Where the LLM path gave up (procedural only); null otherwise. */
  failedAt: DirectorFailurePoint | null;
  /** Placement arm actually used for this request (`slot` may degrade to `uv`). */
  placement: DirectorPlacementMode;
  /** Route arm only: decoration bookkeeping for the eval. */
  routeDecoration: RouteDecorationTrace | null;
  /** Compact first-try candidate (parsed object or recovered JSON). */
  firstTryPlan: unknown;
  /** Raw first-try model text when structured parse failed. */
  firstTryRawText: string | null;
  /** Route arm: hedged decoration request bookkeeping; null otherwise. */
  hedge?: HedgeTrace | null;
  /**
   * Server work before the first model call: per-stage ms plus `totalMs`
   * (request start → first invoke). Undefined when no model call started.
   */
  preCall?: Record<string, number>;
}

export interface RouteDecorationTrace {
  candidateCount: number;
  routeId: string | null;
  /** Lines removed by the server sanitizer before parse. */
  droppedLines: number;
  /** DECORATION_BANNED_WORDS hits in the served lines. */
  bannedWordHits: number;
  /** Options applyDecoration replaced with defaults. */
  replaced: string[];
}

export interface RunDirectorOptions {
  primary: StructuredChat;
  budgetMs?: number;
  llmRepairMinRemainingMs?: number;
  proceduralReserveMs?: number;
  now?: () => number;
  /** Request-arrival timestamp; defaults to `now()` when omitted. */
  startedMs?: number;
  promptVersion?: string;
  logger: DirectorLogger;
  quotaBreaker?: LlmQuotaBreaker;
  /**
   * Route-arm hedged decoration request (DIRECTOR_HEDGE_MS). Omitted or
   * delayMs 0: no hedge. `reserve` takes one LLM_DAILY_MAX slot (and
   * enforces the 80 % rule) before the hedge fires.
   */
  hedge?: { delayMs: number; reserve?: HedgeOptions['reserve'] };
  /**
   * LLM_DAILY_MAX reservation started by the caller in parallel with prompt
   * prep; awaited right before the first model call. `false` → procedural
   * `llm-quota` (failedAt `quota-precheck`). Omitted: no gate.
   */
  llmGate?: Promise<boolean>;
  /** Caller-side pre-call stage timings (ms) merged into `preCall`. */
  preCall?: Record<string, number>;
  /** `DIRECTOR_PLACEMENT`: `uv` (default) or `slot`. */
  placement?: DirectorPlacementMode;
  /**
   * Chat for the route-arm decoration call only (DIRECTOR_DECORATION_THINKING).
   * Defaults to `primary`.
   */
  decoration?: StructuredChat;
}

/** Start of one LLM call: wall-clock ms and the prompt's character size. */
interface CallStart {
  ms: number;
  promptChars: number;
  /** Extra telemetry fields (hedge role) for this call's row. */
  extra?: HedgeRoleTag;
}

interface HedgeRoleTag {
  hedgeRole?: 'first' | 'second';
}

interface AttemptOk {
  kind: 'plan';
  valid: boolean;
  plan?: LevelPlan;
  raw: unknown;
  rawText: string | null;
  issues: Issue[];
  /** Slot-mode output named slot ids the request never offered. */
  slotResolveFailed: boolean;
}

interface AttemptFail {
  kind: 'timeout' | 'error' | 'quota';
}

type Attempt = AttemptOk | AttemptFail;

type TraceExtras = Partial<
  Pick<
    DirectorOutcome,
    | 'validation'
    | 'repairedBy'
    | 'firstTryPlan'
    | 'firstTryRawText'
    | 'stage'
    | 'failedAt'
    | 'placement'
    | 'routeDecoration'
  >
>;

function roundMs(ms: number): number {
  return Math.round(ms * 10) / 10;
}

function withTrace(
  outcome: Pick<DirectorOutcome, 'response' | 'telemetry'> &
    Partial<DirectorOutcome>,
  extras?: TraceExtras
): DirectorOutcome {
  const procedural = outcome.response.source === 'procedural';
  return {
    response: outcome.response,
    telemetry: outcome.telemetry,
    validation:
      extras?.validation ?? outcome.validation ?? emptyValidationTrace(),
    repairedBy: extras?.repairedBy ?? outcome.repairedBy ?? null,
    stage:
      extras?.stage ??
      outcome.stage ??
      (procedural ? 'procedural' : 'first-try'),
    failedAt: extras?.failedAt ?? outcome.failedAt ?? null,
    placement:
      extras?.placement ?? outcome.placement ?? DEFAULT_DIRECTOR_PLACEMENT,
    routeDecoration: extras?.routeDecoration ?? outcome.routeDecoration ?? null,
    firstTryPlan: extras?.firstTryPlan ?? outcome.firstTryPlan ?? null,
    firstTryRawText: extras?.firstTryRawText ?? outcome.firstTryRawText ?? null,
  };
}

/**
 * Bind a procedural plan to the request graph: generate, validate, repair,
 * validate again. Matches the client director (`apps/client/src/game/director`).
 */
export function bindPlanToGraph(request: LevelRequest): {
  plan: LevelPlan;
  repairs: string[];
  relaxed: RelaxedRule[];
} {
  const seed = makeDailySeed(request.graph.roomHash, request.date);
  const generated = generatePlan(request.graph, seed, request.tier, {
    recentThemes: request.recentThemes,
  });
  const first = validatePlan(generated, request.graph);
  if (first.ok) {
    return { plan: generated, repairs: [], relaxed: first.relaxed };
  }
  const repaired = repairPlan(generated, request.graph);
  if (repaired.ok) {
    return {
      plan: repaired.plan,
      repairs: repaired.repairs,
      relaxed: repaired.relaxed,
    };
  }
  // Repair failed explicitly (no placeholder). generatePlan's own output is
  // already the procedural fallback; serve it as generated.
  return { plan: generated, repairs: [], relaxed: first.relaxed };
}

export function proceduralOutcome(
  request: LevelRequest,
  startedMs: number,
  telemetry: LlmCallTelemetry[],
  promptVersion: string,
  now: () => number,
  fallbackReason?: FallbackReason
): DirectorOutcome {
  const bound = bindPlanToGraph(request);
  return withTrace({
    response: LevelResponse.parse({
      plan: bound.plan,
      source: 'procedural',
      cacheKey: makeCacheKey(
        request.graph.roomHash,
        request.date,
        request.tier,
        promptVersion
      ),
      promptVersion,
      latencyMs: Math.max(0, now() - startedMs),
      repairs: bound.repairs,
      relaxed: bound.relaxed,
      ...(fallbackReason === undefined ? {} : { fallbackReason }),
    }),
    telemetry,
  });
}

function llmOutcome(
  request: LevelRequest,
  plan: LevelPlan,
  source: 'llm' | 'llm_repaired',
  model: string,
  repairs: string[],
  startedMs: number,
  telemetry: LlmCallTelemetry[],
  promptVersion: string,
  now: () => number
): Pick<DirectorOutcome, 'response' | 'telemetry'> {
  return {
    response: LevelResponse.parse({
      plan,
      source,
      cacheKey: makeCacheKey(
        request.graph.roomHash,
        request.date,
        request.tier,
        promptVersion
      ),
      model,
      promptVersion,
      latencyMs: Math.max(0, now() - startedMs),
      repairs,
      relaxed: validatePlan(plan, request.graph).relaxed,
    }),
    telemetry,
  };
}

function repairAsPlan(
  raw: unknown,
  fallback: LevelPlan | undefined
): LevelPlan {
  if (fallback !== undefined) {
    return fallback;
  }
  return expandSlimCandidate(raw) as LevelPlan;
}

/** Reason for a procedural answer after a Gemini call that returned output. */
function reasonForPlanAttempt(attempt: AttemptOk): FallbackReason {
  if (attempt.slotResolveFailed) {
    return 'slot-resolve-failed';
  }
  if (attempt.plan === undefined) {
    return 'llm-parse-failed';
  }
  return 'llm-invalid';
}

function reasonForFailedCall(kind: AttemptFail['kind']): FallbackReason {
  if (kind === 'quota') {
    return 'llm-quota';
  }
  if (kind === 'timeout') {
    return 'llm-timeout';
  }
  return 'llm-error';
}

/**
 * Live director loop:
 *
 *   Gemini → validate → snapPlacementsToSlots → repairRoute → repairPlan →
 *   validate → (time-gated) one Gemini repair → procedural.
 *
 * Every procedural answer carries a specific `fallbackReason` and a
 * `failedAt` point. Never throws for provider/timeout/invalid output.
 */
export async function runDirector(
  request: LevelRequest,
  options: RunDirectorOptions
): Promise<DirectorOutcome> {
  const holder: { preCall?: Record<string, number> } = {};
  const outcome = await runDirectorInner(request, options, holder);
  return holder.preCall === undefined
    ? outcome
    : { ...outcome, preCall: holder.preCall };
}

async function runDirectorInner(
  request: LevelRequest,
  options: RunDirectorOptions,
  holder: { preCall?: Record<string, number> }
): Promise<DirectorOutcome> {
  const now = options.now ?? (() => Date.now());
  const startedMs = options.startedMs ?? now();
  const repairMin =
    options.llmRepairMinRemainingMs ?? LLM_REPAIR_MIN_REMAINING_MS;
  const promptVersion = options.promptVersion ?? PROMPT_VERSION;
  const seed = makeDailySeed(request.graph.roomHash, request.date);
  const telemetry: LlmCallTelemetry[] = [];
  // Same object as the caller's so late caller stages (dailyReserveMs) land.
  const preCall: Record<string, number> = options.preCall ?? {};
  let preCallDone = false;
  const timeStage = <T>(name: string, fn: () => T): T => {
    const t0 = performance.now();
    try {
      return fn();
    } finally {
      preCall[name] = roundMs(performance.now() - t0);
    }
  };
  /** Await the caller's daily-usage reservation; false = capped/unavailable. */
  const passGate = async (): Promise<boolean> => {
    if (options.llmGate === undefined) return true;
    const t0 = performance.now();
    const ok = await options.llmGate;
    preCall.llmGateWaitMs = roundMs(performance.now() - t0);
    return ok;
  };
  /** Close the pre-call breakdown right before the first model invoke. */
  const finishPreCall = (): void => {
    if (preCallDone) return;
    preCallDone = true;
    preCall.totalMs = roundMs(Math.max(0, now() - startedMs));
    holder.preCall = preCall;
    options.logger.log(
      `director.precall placement=${options.placement ?? DEFAULT_DIRECTOR_PLACEMENT} ${Object.entries(
        preCall
      )
        .map(([key, value]) => `${key}=${String(value)}`)
        .join(' ')}`
    );
  };

  const requestedPlacement = options.placement ?? DEFAULT_DIRECTOR_PLACEMENT;
  let slotContext: SlotRequestContext | undefined;
  if (requestedPlacement === 'slot') {
    slotContext = buildSlotRequestContext(request.graph, seed);
    if (slotContext === undefined) {
      options.logger.warn(
        'director.slot_mode_no_hinted_slots falling back to uv placement'
      );
    }
  }
  const placement: DirectorPlacementMode =
    requestedPlacement === 'route'
      ? 'route'
      : slotContext === undefined
        ? 'uv'
        : 'slot';

  const fallback = (
    reason: FallbackReason,
    failedAt: DirectorFailurePoint,
    extras?: TraceExtras
  ): DirectorOutcome => {
    const outcome = proceduralOutcome(
      request,
      startedMs,
      telemetry,
      promptVersion,
      now,
      reason
    );
    options.logger.log(
      `director.fallback reason=${reason} failedAt=${failedAt} placement=${placement}`
    );
    return withTrace(outcome, {
      ...extras,
      stage: 'procedural',
      failedAt,
      placement,
      repairedBy: null,
    });
  };

  if (options.quotaBreaker?.isOpen()) {
    return fallback('llm-quota', 'quota-precheck');
  }

  const deadline = createDirectorDeadline({
    budgetMs: options.budgetMs,
    proceduralReserveMs: options.proceduralReserveMs,
    now,
    startedMs,
  });

  const record = (
    chat: StructuredChat,
    callStarted: CallStart,
    outcome: LlmCallOutcome,
    raw?: unknown,
    ttftMs?: number | null
  ): void => {
    const tokens = tokensFromRaw(raw);
    const totalMs = Math.max(0, now() - callStarted.ms);
    const row: LlmCallTelemetry = {
      provider: chat.provider,
      model: chat.model,
      inputTokens: tokens.inputTokens,
      outputTokens: tokens.outputTokens,
      thinkingTokens: tokens.thinkingTokens,
      thoughtsTokenCount: tokens.thoughtsTokenCount,
      latencyMs: totalMs,
      ttftMs: ttftMs ?? null,
      outcome,
      ttfbMs: ttftMs ?? null,
      totalMs,
      cachedTokens: tokens.cachedTokens,
      promptChars: callStarted.promptChars,
      startOffsetMs: Math.max(0, callStarted.ms - startedMs),
      ...callStarted.extra,
      ...(telemetry.length === 0 && holder.preCall !== undefined
        ? { preCallMs: { ...holder.preCall } }
        : {}),
    };
    telemetry.push(row);
    logLlmCall(options.logger, row);
  };

  let routeHedge: HedgeTrace | null = null;

  /** Telemetry row for a hedged call that was not the chosen one. */
  const recordCall = (
    chat: StructuredChat,
    rec: HedgeCallRecord,
    extra: HedgeRoleTag
  ): void => {
    const tokens = tokensFromRaw(rec.call?.raw);
    const totalMs = Math.max(0, (rec.endedMs ?? now()) - rec.startedMs);
    let outcome: LlmCallOutcome;
    if (rec.outcome === 'aborted') outcome = 'aborted';
    else if (rec.outcome === 'unusable') outcome = 'invalid';
    else if (rec.outcome === 'ok') outcome = 'ok';
    else outcome = isTimeoutError(rec.error) ? 'timeout' : 'error';
    const row: LlmCallTelemetry = {
      provider: chat.provider,
      model: chat.model,
      inputTokens: tokens.inputTokens,
      outputTokens: tokens.outputTokens,
      thinkingTokens: tokens.thinkingTokens,
      thoughtsTokenCount: tokens.thoughtsTokenCount,
      latencyMs: totalMs,
      ttftMs: rec.call?.ttftMs ?? null,
      outcome,
      ttfbMs: rec.call?.ttftMs ?? null,
      totalMs,
      cachedTokens: tokens.cachedTokens,
      promptChars: null,
      startOffsetMs: Math.max(0, rec.startedMs - startedMs),
      ...extra,
    };
    telemetry.push(row);
    logLlmCall(options.logger, row);
  };

  const attempt = async (
    chat: StructuredChat,
    messages: (SystemMessage | HumanMessage)[],
    phase: 'draft' | 'repair'
  ): Promise<Attempt> => {
    const callStarted: CallStart = {
      ms: now(),
      promptChars: promptCharCount(messages),
    };
    if (!deadline.canStartLlm(1)) {
      record(chat, callStarted, 'timeout');
      return { kind: 'timeout' };
    }
    try {
      const call = await chat.invokeStructured(
        messages,
        deadline.signal,
        slotContext?.callOptions
      );
      const structured = structuredCandidate(call);
      const rawText = textFromRaw(call.raw) ?? null;

      // Slot mode: resolveSlotIds before validation so everything after
      // this point (and the client) sees the unchanged uv plan shape.
      let candidate: unknown = structured;
      if (slotContext !== undefined) {
        const resolved = resolveSlotCandidate(structured, request.graph, seed);
        if (resolved.kind === 'resolve-failed') {
          record(chat, callStarted, 'invalid', call.raw, call.ttftMs);
          options.logger.warn(
            `director.slot_resolve_failed phase=${phase} issues=${resolved.issues.map((item) => item.code).join(',')}`
          );
          return {
            kind: 'plan',
            valid: false,
            raw: structured,
            rawText,
            slotResolveFailed: true,
            issues: resolved.issues.map((item) => ({
              code: 'SCHEMA_INVALID',
              message: item.message,
              ...(item.placementId === undefined
                ? {}
                : { placementId: item.placementId }),
            })),
          };
        }
        if (resolved.kind === 'ok') {
          candidate = resolved.candidate;
          if (resolved.issues.length > 0) {
            options.logger.debug(
              `director.slot_resolve_issues phase=${phase} issues=${resolved.issues.map((item) => item.code).join(',')}`
            );
          }
        }
      }

      const parsedPlan = tryParseLlmPlan(candidate, {
        seed,
        graph: request.graph,
        tier: request.tier,
      });
      if (parsedPlan.plan !== undefined) {
        const validation = validatePlan(parsedPlan.plan, request.graph);
        if (validation.ok) {
          record(
            chat,
            callStarted,
            phase === 'repair' ? 'repaired' : 'ok',
            call.raw,
            call.ttftMs
          );
          return {
            kind: 'plan',
            valid: true,
            plan: parsedPlan.plan,
            raw: candidate,
            rawText,
            issues: [],
            slotResolveFailed: false,
          };
        }
        record(chat, callStarted, 'invalid', call.raw, call.ttftMs);
        return {
          kind: 'plan',
          valid: false,
          plan: parsedPlan.plan,
          raw: candidate,
          rawText,
          issues: validation.issues,
          slotResolveFailed: false,
        };
      }
      record(chat, callStarted, 'invalid', call.raw, call.ttftMs);
      return {
        kind: 'plan',
        valid: false,
        raw: candidate,
        rawText,
        slotResolveFailed: false,
        issues: [
          {
            code: 'SCHEMA_INVALID',
            message: parsedPlan.parseError ?? 'LevelPlanLLM parse failed',
          },
        ],
      };
    } catch (err) {
      if (isQuotaError(err)) {
        options.quotaBreaker?.trip(err);
        record(chat, callStarted, 'error');
        return { kind: 'quota' };
      }
      if (isTimeoutError(err) || deadline.remainingForLlm() <= 0) {
        record(chat, callStarted, 'timeout');
        return { kind: 'timeout' };
      }
      record(chat, callStarted, 'error');
      options.logger.warn(
        `director.provider_error phase=${phase} provider=${chat.provider} model=${chat.model} message=${err instanceof Error ? err.message : 'error'}`
      );
      return { kind: 'error' };
    }
  };

  /**
   * Hybrid route arm: level-core builds valid candidate routes, Gemini picks
   * one and decorates it in ONE call (no LLM repair in this arm).
   */
  const runRoute = async (): Promise<DirectorOutcome> => {
    const chat = options.decoration ?? options.primary;
    const candidates = timeStage('candidateRoutesMs', () =>
      candidateRoutes(request.graph, {
        seed,
        tier: request.tier,
      })
    );
    if (candidates.length === 0) {
      return fallback('no-route-candidates', 'route-candidates');
    }
    const enums = timeStage('decorationEnumsMs', () => decorationEnums(candidates));
    const callOptions = timeStage('schemaMs', () => routeCallOptions(enums));
    const trace: RouteDecorationTrace = {
      candidateCount: candidates.length,
      routeId: null,
      droppedLines: 0,
      bannedWordHits: 0,
      replaced: [],
    };
    const messages = timeStage('promptMs', () =>
      toLangchainMessages(
        buildDecorationMessages(candidates, { seed, tier: request.tier })
      )
    );
    if (!(await passGate())) {
      return fallback('llm-quota', 'quota-precheck', { routeDecoration: trace });
    }
    finishPreCall();

    const callStarted: CallStart = {
      ms: now(),
      promptChars: promptCharCount(messages),
    };
    if (!deadline.canStartLlm(1)) {
      record(chat, callStarted, 'timeout');
      return fallback('llm-timeout', 'route-decoration', {
        routeDecoration: trace,
      });
    }
    const hedged = await hedgedInvoke(
      (signal) =>
        chat.invokeStructured(messages, signal, callOptions),
      deadline.signal,
      {
        delayMs: options.hedge?.delayMs ?? 0,
        breakerOpen: () => options.quotaBreaker?.isOpen() ?? false,
        reserve: options.hedge?.reserve,
      },
      (result) => {
        const candidate = structuredCandidate(result);
        return candidate !== undefined && candidate !== null;
      },
      now
    );
    routeHedge = {
      hedgeFired: hedged.hedgeFired,
      hedgeWinner: hedged.hedgeWinner,
      hedgeSkippedReason: hedged.hedgeSkippedReason,
    };
    if (hedged.hedgeFired) {
      options.logger.log(
        `director.hedge fired winner=${String(hedged.hedgeWinner)} calls=${hedged.calls
          .map((rec) => `${rec.role}:${String(rec.outcome)}:${String((rec.endedMs ?? now()) - rec.startedMs)}ms`)
          .join(',')}`
      );
    }
    const hedgeRole = (role: 'first' | 'second'): HedgeRoleTag =>
      hedged.hedgeFired ? { hedgeRole: role } : {};
    // One telemetry row per call: the non-chosen ones here (with their own
    // duration), the chosen one below with its final outcome.
    for (const rec of hedged.calls) {
      if (rec.role === hedged.callRole) continue;
      if (hedged.call === undefined && rec === hedged.calls[0]) continue;
      recordCall(chat, rec, hedgeRole(rec.role));
    }
    const chosenRec =
      hedged.calls.find((rec) => rec.role === hedged.callRole) ??
      hedged.calls[0];
    if (chosenRec !== undefined) {
      callStarted.ms = chosenRec.startedMs;
      callStarted.extra = hedgeRole(chosenRec.role);
    }
    const call = hedged.call;
    if (call === undefined) {
      const err = hedged.error;
      if (isQuotaError(err)) {
        options.quotaBreaker?.trip(err);
        record(chat, callStarted, 'error');
        return fallback('llm-quota', 'route-decoration', {
          routeDecoration: trace,
        });
      }
      if (isTimeoutError(err) || deadline.remainingForLlm() <= 0) {
        record(chat, callStarted, 'timeout');
        return fallback('llm-timeout', 'route-decoration', {
          routeDecoration: trace,
        });
      }
      record(chat, callStarted, 'error');
      options.logger.warn(
        `director.provider_error phase=route provider=${chat.provider} model=${chat.model} message=${err instanceof Error ? err.message : 'error'}`
      );
      return fallback('llm-error', 'route-decoration', {
        routeDecoration: trace,
      });
    }

    const raw = structuredCandidate(call);
    const rawText = textFromRaw(call.raw) ?? null;
    const parsed = parseRouteDecoration(raw, enums);
    trace.droppedLines = parsed.droppedLines;
    if (parsed.kind === 'parse-failed') {
      record(chat, callStarted, 'invalid', call.raw, call.ttftMs);
      return fallback('llm-parse-failed', 'route-decoration', {
        validation: {
          firstTry: [{ code: 'SCHEMA_INVALID', path: 'decoration' }],
          afterLocal: null,
          afterLlmRepair: null,
        },
        routeDecoration: trace,
        firstTryPlan: raw ?? null,
        firstTryRawText: rawText,
      });
    }
    trace.routeId = parsed.decoration.routeId;
    const applied = applyDecoration(candidates, parsed.decoration);
    if (!applied.ok) {
      record(chat, callStarted, 'invalid', call.raw, call.ttftMs);
      options.logger.warn(
        `director.route_unknown_id routeId=${applied.routeId}`
      );
      return fallback('llm-invalid', 'route-decoration', {
        validation: {
          firstTry: [{ code: applied.error, path: `route:${applied.routeId}` }],
          afterLocal: null,
          afterLlmRepair: null,
        },
        routeDecoration: trace,
        firstTryPlan: raw ?? null,
      });
    }
    trace.replaced = applied.replaced;
    const chosen = candidates.find(
      (route) => route.id === parsed.decoration.routeId
    );

    let plan = applied.plan;
    let repairs: string[] = [];
    let stage: DirectorStage = 'route';
    let firstTry = traceIssues(validatePlan(plan, request.graph).issues);
    let afterLocal: ReturnType<typeof traceIssues> | null = null;
    if (firstTry.length > 0) {
      const local = localRepairPlan(plan, request.graph, {
        seed,
        tier: request.tier,
      });
      afterLocal = traceIssues(local.result.issues);
      if (!local.ok) {
        record(chat, callStarted, 'invalid', call.raw, call.ttftMs);
        return fallback(
          'llm-invalid',
          local.routeSkeleton ? 'repairRoute' : 'route-validate',
          {
            validation: { firstTry, afterLocal, afterLlmRepair: null },
            routeDecoration: trace,
            firstTryPlan: raw ?? null,
          }
        );
      }
      plan = local.plan;
      repairs = local.repairs;
      stage = local.fixedBy;
    } else {
      firstTry = [];
    }
    record(
      chat,
      callStarted,
      afterLocal === null ? 'ok' : 'repaired',
      call.raw,
      call.ttftMs
    );
    // Lines must name a beat of the served plan (local repair may change
    // the beat count); applyDecoration already dropped duplicates /
    // out-of-range beats of the decorated plan.
    const lineReasons = [...parsed.dropReasons];
    const decoratedIn = parsed.decoration.lines?.length ?? 0;
    for (let i = applied.lines.length; i < decoratedIn; i += 1) {
      lineReasons.push('apply-decoration');
    }
    const servedLines = applied.lines.filter((line) => {
      const ok = Number(line.beat) < plan.beats.length;
      if (!ok) lineReasons.push(`beat-beyond-plan:${line.beat}`);
      return ok;
    });
    trace.droppedLines = parsed.linesIn - servedLines.length;
    trace.bannedWordHits = countBannedWordHits(servedLines);
    options.logger.log(
      `director.route_lines routeId=${parsed.decoration.routeId} stage=${stage} linesRaw=${String(parsed.linesIn)} linesKept=${String(servedLines.length)} droppedLines=${String(trace.droppedLines)} reasons=${lineReasons.length > 0 ? lineReasons.join('|') : 'none'}`
    );
    options.logger.log(
      `director.plan_fixed stage=${stage} placement=route routeId=${parsed.decoration.routeId} droppedLines=${String(trace.droppedLines)}`
    );
    const relaxed =
      chosen?.relaxed ?? validatePlan(plan, request.graph).relaxed;
    return withTrace(
      {
        response: LevelResponse.parse({
          plan,
          source: afterLocal === null ? 'llm' : 'llm_repaired',
          cacheKey: makeCacheKey(
            request.graph.roomHash,
            request.date,
            request.tier,
            promptVersion
          ),
          model: chat.model,
          promptVersion,
          latencyMs: Math.max(0, now() - startedMs),
          repairs,
          relaxed,
          ...(servedLines.length > 0 ? { lines: servedLines } : {}),
          routeId: parsed.decoration.routeId,
        }),
        telemetry,
      },
      {
        validation: { firstTry, afterLocal, afterLlmRepair: null },
        repairedBy: afterLocal === null ? null : 'local',
        stage,
        placement: 'route',
        routeDecoration: trace,
        firstTryPlan: raw ?? null,
      }
    );
  };

  try {
    if (placement === 'route') {
      const routed = await runRoute();
      return { ...routed, hedge: routeHedge };
    }
    const draftMessages = timeStage('promptMs', () => [
      new SystemMessage(SYSTEM_PREFIX),
      new HumanMessage(
        buildUserMessage({
          graph: request.graph,
          seed,
          tier: request.tier,
          recentThemes: request.recentThemes,
          placement,
        })
      ),
    ]);

    const chat = options.primary;
    if (!(await passGate())) {
      return fallback('llm-quota', 'quota-precheck');
    }
    finishPreCall();
    const draft = await attempt(chat, draftMessages, 'draft');

    if (draft.kind !== 'plan') {
      return fallback(reasonForFailedCall(draft.kind), 'draft');
    }

    const firstTryPlan = draft.raw ?? null;
    const firstTryIssues = traceIssues(draft.issues);
    const firstTryRawText = draft.plan === undefined ? draft.rawText : null;
    const draftTrace = {
      firstTryPlan,
      firstTryRawText,
    };

    if (draft.valid && draft.plan !== undefined) {
      options.logger.log(
        `director.plan_fixed stage=first-try placement=${placement}`
      );
      return withTrace(
        llmOutcome(
          request,
          draft.plan,
          'llm',
          chat.model,
          [],
          startedMs,
          telemetry,
          promptVersion,
          now
        ),
        {
          validation: {
            firstTry: [],
            afterLocal: null,
            afterLlmRepair: null,
          },
          repairedBy: null,
          stage: 'first-try',
          placement,
          ...draftTrace,
        }
      );
    }

    if (draft.slotResolveFailed) {
      // No surface/u/v to repair locally; a second call would see the
      // same per-request enum, so go procedural with a specific reason.
      return fallback('slot-resolve-failed', 'slot-resolve', {
        validation: {
          firstTry: firstTryIssues,
          afterLocal: null,
          afterLlmRepair: null,
        },
        ...draftTrace,
      });
    }

    const local = localRepairPlan(
      repairAsPlan(draft.raw, draft.plan),
      request.graph,
      { seed, tier: request.tier }
    );
    const afterLocal = traceIssues(local.result.issues);
    if (!local.ok && local.routeSkeleton) {
      options.logger.log(
        'director.route_skeleton repairRoute returned a fresh skeleton; not serving it as a repaired plan'
      );
      return fallback('llm-invalid', 'repairRoute', {
        validation: {
          firstTry: firstTryIssues,
          afterLocal,
          afterLlmRepair: null,
        },
        ...draftTrace,
      });
    }
    if (local.ok) {
      const fixedBy = local.fixedBy;
      options.logger.log(
        `director.plan_fixed stage=${fixedBy} placement=${placement} repairs=${local.repairs.join('|')}`
      );
      return withTrace(
        llmOutcome(
          request,
          local.plan,
          'llm_repaired',
          chat.model,
          local.repairs,
          startedMs,
          telemetry,
          promptVersion,
          now
        ),
        {
          validation: {
            firstTry: firstTryIssues,
            afterLocal,
            afterLlmRepair: null,
          },
          repairedBy: 'local',
          stage: fixedBy,
          placement,
          ...draftTrace,
        }
      );
    }

    // Time gate: only spend a second Gemini call when enough of the
    // director deadline is left for it to plausibly finish.
    if (!deadline.canStartLlm(repairMin)) {
      options.logger.log(
        `director.skip_llm_repair remainingForLlm=${String(deadline.remainingForLlm())} min=${String(repairMin)}`
      );
      return fallback('llm-invalid', 'llm-repair-gate', {
        validation: {
          firstTry: firstTryIssues,
          afterLocal,
          afterLlmRepair: null,
        },
        ...draftTrace,
      });
    }

    const issuesForRepair =
      !local.unrecoverable && local.result.issues.length > 0
        ? local.result.issues
        : draft.issues;
    const previous = draft.raw ?? draft.rawText ?? null;
    const repairMessages = [
      ...draftMessages,
      new HumanMessage(buildRepairMessage(issuesForRepair, previous)),
    ];
    const repaired = await attempt(chat, repairMessages, 'repair');

    if (repaired.kind !== 'plan') {
      return fallback(reasonForFailedCall(repaired.kind), 'llm-repair', {
        validation: {
          firstTry: firstTryIssues,
          afterLocal,
          afterLlmRepair: null,
        },
        ...draftTrace,
      });
    }

    const afterLlmRepair = traceIssues(repaired.issues);
    if (repaired.valid && repaired.plan) {
      options.logger.log(
        `director.plan_fixed stage=llm-repair placement=${placement}`
      );
      return withTrace(
        llmOutcome(
          request,
          repaired.plan,
          'llm_repaired',
          chat.model,
          [...local.repairs, 'llm-repair'],
          startedMs,
          telemetry,
          promptVersion,
          now
        ),
        {
          validation: {
            firstTry: firstTryIssues,
            afterLocal,
            afterLlmRepair: [],
          },
          repairedBy: 'llm',
          stage: 'llm-repair',
          placement,
          ...draftTrace,
        }
      );
    }

    return fallback(reasonForPlanAttempt(repaired), 'llm-repair', {
      validation: {
        firstTry: firstTryIssues,
        afterLocal,
        afterLlmRepair,
      },
      ...draftTrace,
    });
  } catch (err) {
    options.logger.warn(
      `director.unexpected_error message=${err instanceof Error ? err.message : 'error'}`
    );
    return fallback('director-error', 'director');
  } finally {
    deadline.dispose();
  }
}
