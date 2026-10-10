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
import { tryParseLlmPlan } from './parse-plan';
import {
  buildRepairMessage,
  buildUserMessage,
  PROMPT_VERSION,
  SYSTEM_PREFIX,
} from './prompts';
import { isQuotaError, type LlmQuotaBreaker } from './quota-breaker';
import { structuredCandidate, type StructuredChat } from './structured-chat';
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
  issues: Issue[];
}

interface AttemptFail {
  kind: 'timeout' | 'error' | 'quota';
}

type Attempt = AttemptOk | AttemptFail;

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
  return {
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
  };
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
): DirectorOutcome {
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
  return raw as LevelPlan;
}

/**
 * Live director loop: Gemini → validate → local repair → one Gemini repair →
 * procedural. Never throws for provider/timeout/invalid output.
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
    raw?: unknown
  ): void => {
    const tokens = tokensFromRaw(raw);
    const row: LlmCallTelemetry = {
      provider: chat.provider,
      model: chat.model,
      inputTokens: tokens.inputTokens,
      outputTokens: tokens.outputTokens,
      latencyMs: Math.max(0, now() - callStarted),
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
      const parsedPlan = tryParseLlmPlan(candidate);
      if (parsedPlan.plan !== undefined) {
        const validation = validatePlan(parsedPlan.plan, request.graph);
        if (validation.ok) {
          record(
            chat,
            callStarted,
            phase === 'repair' ? 'repaired' : 'ok',
            call.raw
          );
          return {
            kind: 'plan',
            valid: true,
            plan: parsedPlan.plan,
            raw: candidate,
            issues: [],
          };
        }
        record(chat, callStarted, 'invalid', call.raw);
        return {
          kind: 'plan',
          valid: false,
          plan: parsedPlan.plan,
          raw: candidate,
          issues: validation.issues,
        };
      }
      record(chat, callStarted, 'invalid', call.raw);
      return {
        kind: 'plan',
        valid: false,
        raw: candidate,
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
    const seed = makeDailySeed(request.graph.roomHash, request.date);
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

    if (draft.valid && draft.plan !== undefined) {
      return llmOutcome(
        request,
        draft.plan,
        'llm',
        chat.model,
        [],
        startedMs,
        telemetry,
        promptVersion,
        now
      );
    }

    const local = repairPlan(
      repairAsPlan(draft.raw, draft.plan),
      request.graph
    );
    if (local.result.ok) {
      return llmOutcome(
        request,
        local.plan,
        'llm_repaired',
        chat.model,
        local.repairs,
        startedMs,
        telemetry,
        promptVersion,
        now
      );
    }

    if (!deadline.canStartLlm(repairMin)) {
      options.logger.debug(
        `director.skip_llm_repair remainingForLlm=${String(deadline.remainingForLlm())} min=${String(repairMin)}`
      );
      return proceduralOutcome(
        request,
        startedMs,
        telemetry,
        promptVersion,
        now
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
      return quotaFallback();
    }

    if (repaired.kind === 'plan' && repaired.valid && repaired.plan) {
      return llmOutcome(
        request,
        repaired.plan,
        'llm_repaired',
        chat.model,
        [...local.repairs, 'llm-repair'],
        startedMs,
        telemetry,
        promptVersion,
        now
      );
    }

    if (repaired.kind === 'plan') {
      const second = repairPlan(
        repairAsPlan(repaired.raw, repaired.plan),
        request.graph
      );
      if (second.result.ok) {
        return llmOutcome(
          request,
          second.plan,
          'llm_repaired',
          chat.model,
          [...local.repairs, ...second.repairs, 'llm-repair'],
          startedMs,
          telemetry,
          promptVersion,
          now
        );
      }
    }

    return proceduralOutcome(request, startedMs, telemetry, promptVersion, now);
  } finally {
    deadline.dispose();
  }
}
