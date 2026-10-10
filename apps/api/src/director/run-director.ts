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
} from '@roomquest/schema';
import { makeCacheKey } from '../levels/cache-key';
import { makeDailySeed } from '../levels/daily-seed';
import { createDirectorDeadline } from './deadline';
import { LLM_REPAIR_MIN_REMAINING_MS } from './director.constants';
import { isTimeoutError } from './errors';
import {
  emptyValidationTrace,
  traceIssues,
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
}

interface AttemptOk {
  kind: 'plan';
  valid: boolean;
  plan?: LevelPlan;
  raw: unknown;
  rawText: string | null;
  issues: Issue[];
}

interface AttemptFail {
  kind: 'timeout' | 'error' | 'quota';
}

type Attempt = AttemptOk | AttemptFail;

function withTrace(
  outcome: Pick<DirectorOutcome, 'response' | 'telemetry'>,
  extras?: Partial<
    Pick<
      DirectorOutcome,
      'validation' | 'repairedBy' | 'firstTryPlan' | 'firstTryRawText'
    >
  >
): DirectorOutcome {
  return {
    ...outcome,
    validation: extras?.validation ?? emptyValidationTrace(),
    repairedBy: extras?.repairedBy ?? null,
    firstTryPlan: extras?.firstTryPlan ?? null,
    firstTryRawText: extras?.firstTryRawText ?? null,
  };
}

/**
 * Bind a procedural plan to the request graph: generate, validate, repair,
 * validate again. Matches the client director (`apps/client/src/game/director`).
 */
export function bindPlanToGraph(request: LevelRequest): {
  plan: LevelPlan;
  repairs: string[];
} {
  const seed = makeDailySeed(request.graph.roomHash, request.date);
  const generated = generatePlan(request.graph, seed, request.tier, {
    recentThemes: request.recentThemes,
  });
  const first = validatePlan(generated, request.graph);
  if (first.ok) {
    return { plan: generated, repairs: [] };
  }
  const repaired = repairPlan(generated, request.graph);
  return { plan: repaired.plan, repairs: repaired.repairs };
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

/**
 * Live director loop: Gemini → validate → local repair (+ snap hook) →
 * validate → one Gemini repair → procedural. Never throws for
 * provider/timeout/invalid output.
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
  const quotaFallback = (): DirectorOutcome =>
    proceduralOutcome(
      request,
      startedMs,
      telemetry,
      promptVersion,
      now,
      'llm-quota'
    );

  if (options.quotaBreaker?.isOpen()) {
    return quotaFallback();
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
      const call = await chat.invokeStructured(messages, deadline.signal);
      const candidate = structuredCandidate(call);
      const rawText = textFromRaw(call.raw) ?? null;
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
        };
      }
      record(chat, callStarted, 'invalid', call.raw, call.ttftMs);
      return {
        kind: 'plan',
        valid: false,
        raw: candidate,
        rawText,
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
        })
      ),
    ];

    const chat = options.primary;
    const draft = await attempt(chat, draftMessages, 'draft');

    if (draft.kind === 'quota') {
      return quotaFallback();
    }

    if (draft.kind !== 'plan') {
      return proceduralOutcome(
        request,
        startedMs,
        telemetry,
        promptVersion,
        now
      );
    }

    const firstTryPlan = draft.raw ?? null;
    const firstTryIssues = traceIssues(draft.issues);
    const firstTryRawText = draft.plan === undefined ? draft.rawText : null;
    const draftTrace = {
      firstTryPlan,
      firstTryRawText,
    };

    if (draft.valid && draft.plan !== undefined) {
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
          ...draftTrace,
        }
      );
    }

    const local = localRepairPlan(
      repairAsPlan(draft.raw, draft.plan),
      request.graph
    );
    const afterLocal = traceIssues(local.result.issues);
    if (local.result.ok) {
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
          ...draftTrace,
        }
      );
    }

    if (!deadline.canStartLlm(repairMin)) {
      options.logger.debug(
        `director.skip_llm_repair remainingForLlm=${String(deadline.remainingForLlm())} min=${String(repairMin)}`
      );
      return withTrace(
        proceduralOutcome(
          request,
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
          repairedBy: null,
          ...draftTrace,
        }
      );
    }

    const issuesForRepair =
      local.result.issues.length > 0 ? local.result.issues : draft.issues;
    const previous = draft.raw ?? local.plan;
    const repairMessages = [
      ...draftMessages,
      new HumanMessage(buildRepairMessage(issuesForRepair, previous)),
    ];
    const repaired = await attempt(chat, repairMessages, 'repair');

    if (repaired.kind === 'quota') {
      return withTrace(quotaFallback(), {
        validation: {
          firstTry: firstTryIssues,
          afterLocal,
          afterLlmRepair: null,
        },
        repairedBy: null,
        ...draftTrace,
      });
    }

    if (repaired.kind === 'plan' && repaired.valid && repaired.plan) {
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
          ...draftTrace,
        }
      );
    }

    if (repaired.kind === 'plan') {
      const second = localRepairPlan(
        repairAsPlan(repaired.raw, repaired.plan),
        request.graph
      );
      const afterLlmRepair = traceIssues(second.result.issues);
      if (second.result.ok) {
        return withTrace(
          llmOutcome(
            request,
            second.plan,
            'llm_repaired',
            chat.model,
            [...local.repairs, ...second.repairs, 'llm-repair'],
            startedMs,
            telemetry,
            promptVersion,
            now
          ),
          {
            validation: {
              firstTry: firstTryIssues,
              afterLocal,
              afterLlmRepair,
            },
            repairedBy: 'llm',
            ...draftTrace,
          }
        );
      }
      return withTrace(
        proceduralOutcome(request, startedMs, telemetry, promptVersion, now),
        {
          validation: {
            firstTry: firstTryIssues,
            afterLocal,
            afterLlmRepair,
          },
          repairedBy: null,
          ...draftTrace,
        }
      );
    }

    return withTrace(
      proceduralOutcome(request, startedMs, telemetry, promptVersion, now),
      {
        validation: {
          firstTry: firstTryIssues,
          afterLocal,
          afterLlmRepair: null,
        },
        repairedBy: null,
        ...draftTrace,
      }
    );
  } finally {
    deadline.dispose();
  }
}
