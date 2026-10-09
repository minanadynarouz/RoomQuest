import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import {
  generatePlan,
  repairPlan,
  validatePlan,
  type Issue,
} from '@roomquest/level-core';
import {
  LevelResponse,
  type LevelPlan,
  type LevelRequest,
} from '@roomquest/schema';
import { makeCacheKey } from '../levels/cache-key';
import { createDirectorDeadline } from './deadline';
import {
  FALLBACK_MIN_REMAINING_MS,
  LLM_REPAIR_MIN_REMAINING_MS,
} from './director.constants';
import { isTimeoutError } from './errors';
import { tryParseLlmPlan } from './parse-plan';
import {
  buildRepairMessage,
  buildUserMessage,
  PROMPT_VERSION,
  SYSTEM_PREFIX,
} from './prompts';
import type { StructuredChat } from './structured-chat';
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
  fallback?: StructuredChat;
  budgetMs?: number;
  fallbackMinRemainingMs?: number;
  llmRepairMinRemainingMs?: number;
  proceduralReserveMs?: number;
  now?: () => number;
  /** Request-arrival timestamp; defaults to `now()` when omitted. */
  startedMs?: number;
  promptVersion?: string;
  logger: DirectorLogger;
}

interface AttemptOk {
  kind: 'plan';
  valid: boolean;
  plan?: LevelPlan;
  raw: unknown;
  issues: Issue[];
}

interface AttemptFail {
  kind: 'timeout' | 'error';
}

type Attempt = AttemptOk | AttemptFail;

function makeSeed(roomHash: string, date: string): string {
  return `${roomHash}-${date}`;
}

export function proceduralOutcome(
  request: LevelRequest,
  startedMs: number,
  telemetry: LlmCallTelemetry[],
  promptVersion: string,
  now: () => number
): DirectorOutcome {
  const seed = makeSeed(request.graph.roomHash, request.date);
  const plan = generatePlan(request.graph, seed, request.tier, {
    recentThemes: request.recentThemes,
  });
  return {
    response: LevelResponse.parse({
      plan,
      source: 'procedural',
      cacheKey: makeCacheKey(
        request.graph.roomHash,
        request.date,
        request.tier,
        promptVersion
      ),
      promptVersion,
      latencyMs: Math.max(0, now() - startedMs),
      repairs: [],
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

function repairAsPlan(raw: unknown, fallback: LevelPlan | undefined): LevelPlan {
  if (fallback !== undefined) {
    return fallback;
  }
  return raw as LevelPlan;
}

/**
 * Live director loop: LLM → validate → local repair → one LLM repair →
 * procedural. Never throws for provider/timeout/invalid output.
 */
export async function runDirector(
  request: LevelRequest,
  options: RunDirectorOptions
): Promise<DirectorOutcome> {
  const now = options.now ?? Date.now;
  const startedMs = options.startedMs ?? now();
  const fallbackMin =
    options.fallbackMinRemainingMs ?? FALLBACK_MIN_REMAINING_MS;
  const repairMin =
    options.llmRepairMinRemainingMs ?? LLM_REPAIR_MIN_REMAINING_MS;
  const promptVersion = options.promptVersion ?? PROMPT_VERSION;
  const telemetry: LlmCallTelemetry[] = [];
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
      const { parsed, raw } = await chat.invokeStructured(
        messages,
        deadline.signal
      );
      const parsedPlan = tryParseLlmPlan(parsed);
      if (parsedPlan.plan !== undefined) {
        const validation = validatePlan(parsedPlan.plan, request.graph);
        if (validation.ok) {
          record(
            chat,
            callStarted,
            phase === 'repair' ? 'repaired' : 'ok',
            raw
          );
          return {
            kind: 'plan',
            valid: true,
            plan: parsedPlan.plan,
            raw: parsed,
            issues: [],
          };
        }
        record(chat, callStarted, 'invalid', raw);
        return {
          kind: 'plan',
          valid: false,
          plan: parsedPlan.plan,
          raw: parsed,
          issues: validation.issues,
        };
      }
      record(chat, callStarted, 'invalid', raw);
      return {
        kind: 'plan',
        valid: false,
        raw: parsed,
        issues: [
          {
            code: 'SCHEMA_INVALID',
            message: parsedPlan.parseError ?? 'LevelPlanLLM parse failed',
          },
        ],
      };
    } catch (err) {
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
    const seed = makeSeed(request.graph.roomHash, request.date);
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

    let chat = options.primary;
    let draft = await attempt(chat, draftMessages, 'draft');

    if (draft.kind === 'error') {
      const fallback = options.fallback;
      if (fallback !== undefined && deadline.canStartLlm(fallbackMin)) {
        chat = fallback;
        draft = await attempt(chat, draftMessages, 'draft');
      }
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

    return proceduralOutcome(
      request,
      startedMs,
      telemetry,
      promptVersion,
      now
    );
  } finally {
    deadline.dispose();
  }
}
