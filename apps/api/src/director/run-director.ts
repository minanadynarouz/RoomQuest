import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import {
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
  /** Compact first-try candidate (parsed object or recovered JSON). */
  firstTryPlan: unknown;
  /** Raw first-try model text when structured parse failed. */
  firstTryRawText: string | null;
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
  /** `DIRECTOR_PLACEMENT`: `uv` (default) or `slot`. */
  placement?: DirectorPlacementMode;
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
  >
>;

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
  return {
    plan: repaired.plan,
    repairs: repaired.repairs,
    relaxed: repaired.relaxed,
  };
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
  const now = options.now ?? (() => Date.now());
  const startedMs = options.startedMs ?? now();
  const repairMin =
    options.llmRepairMinRemainingMs ?? LLM_REPAIR_MIN_REMAINING_MS;
  const promptVersion = options.promptVersion ?? PROMPT_VERSION;
  const seed = makeDailySeed(request.graph.roomHash, request.date);
  const telemetry: LlmCallTelemetry[] = [];

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
    slotContext === undefined ? 'uv' : 'slot';

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
    callStarted: number,
    outcome: LlmCallOutcome,
    raw?: unknown,
    ttftMs?: number | null
  ): void => {
    const tokens = tokensFromRaw(raw);
    const row: LlmCallTelemetry = {
      provider: chat.provider,
      model: chat.model,
      inputTokens: tokens.inputTokens,
      outputTokens: tokens.outputTokens,
      thinkingTokens: tokens.thinkingTokens,
      thoughtsTokenCount: tokens.thoughtsTokenCount,
      latencyMs: Math.max(0, now() - callStarted),
      ttftMs: ttftMs ?? null,
      outcome,
    };
    telemetry.push(row);
    logLlmCall(options.logger, row);
  };

  const attempt = async (
    chat: StructuredChat,
    messages: (SystemMessage | HumanMessage)[],
    phase: 'draft' | 'repair'
  ): Promise<Attempt> => {
    const callStarted = now();
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

  try {
    const draftMessages = [
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
    ];

    const chat = options.primary;
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
      request.graph
    );
    const afterLocal = local.usedStub
      ? [
          {
            code: 'SCHEMA_INVALID',
            path: 'local:stub-plan',
          },
        ]
      : traceIssues(local.result.issues);
    if (local.usedStub) {
      options.logger.log(
        'director.local_repair_stub candidate was unrecoverable; not serving the repairPlan stub'
      );
    }
    if (local.result.ok && !local.usedStub) {
      const fixedBy = local.fixedBy ?? 'repair-plan';
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
      !local.usedStub && local.result.issues.length > 0
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
