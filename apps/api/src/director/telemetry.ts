export type LlmProvider = 'google';

export type LlmCallOutcome =
  'ok' | 'invalid' | 'repaired' | 'timeout' | 'error' | 'aborted';

/**
 * One LLM round-trip. B-07 eval can reuse this record. Do not log API keys.
 */
export interface LlmCallTelemetry {
  provider: LlmProvider;
  model: string;
  inputTokens: number | null;
  outputTokens: number | null;
  thinkingTokens: number | null;
  /** Gemini `usageMetadata.thoughtsTokenCount` (same value as thinkingTokens). */
  thoughtsTokenCount: number | null;
  latencyMs: number;
  ttftMs: number | null;
  outcome: LlmCallOutcome;
  /**
   * Time to first byte/token in ms when the transport streamed; null when
   * not obtainable (non-streaming structured output). Same as ttftMs.
   */
  ttfbMs?: number | null;
  /** Wall time of the call in ms (same as latencyMs). */
  totalMs?: number;
  /** Gemini `usageMetadata.cachedContentTokenCount` (implicit cache hits). */
  cachedTokens?: number | null;
  /** Total characters of the prompt messages sent on this call. */
  promptChars?: number | null;
  /** Route-arm hedged decoration: which of the two calls this row is. */
  hedgeRole?: 'first' | 'second';
  /** Call start, ms after the request started (hedge timing). */
  startOffsetMs?: number;
  /** First call of a request only: server pre-call stage breakdown (ms). */
  preCallMs?: Record<string, number>;
}

export interface DirectorLogger {
  log(message: string): void;
  warn(message: string): void;
  debug(message: string): void;
}

export function logLlmCall(
  logger: DirectorLogger,
  record: LlmCallTelemetry
): void {
  logger.log(`director.llm_call ${JSON.stringify(record)}`);
}

function asFiniteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function thoughtsFromUsage(usage: Record<string, unknown>): number | null {
  const details = asRecord(usage.output_token_details);
  const reasoning =
    details === undefined
      ? null
      : asFiniteNumber(details.reasoning);
  const thoughts =
    asFiniteNumber(usage.thoughtsTokenCount) ??
    asFiniteNumber(usage.thoughts_tokens);
  if (reasoning !== null && reasoning > 0) {
    return reasoning;
  }
  if (thoughts !== null && thoughts > 0) {
    return thoughts;
  }
  return thoughts ?? reasoning;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return undefined;
}

function usageSources(raw: unknown): Record<string, unknown>[] {
  const rec = asRecord(raw);
  if (rec === undefined) {
    return [];
  }
  if ('parsed' in rec && rec.raw !== undefined) {
    return usageSources(rec.raw);
  }
  const nested = asRecord(rec.response_metadata);
  const response = asRecord(rec.response);
  const parts = [
    asRecord(rec.usage_metadata),
    asRecord(rec.usageMetadata),
    nested === undefined ? undefined : asRecord(nested.usageMetadata),
    nested === undefined ? undefined : asRecord(nested.usage_metadata),
    response === undefined ? undefined : asRecord(response.usageMetadata),
  ].filter((item): item is Record<string, unknown> => item !== undefined);
  return parts;
}

function usageRecord(raw: unknown): Record<string, unknown> | undefined {
  const parts = usageSources(raw);
  if (parts.length === 0) {
    return undefined;
  }
  return Object.assign({}, ...parts) as Record<string, unknown>;
}

/**
 * `@langchain/google-genai` 2.3.2 `convertUsageMetadata` keeps only
 * promptTokenCount / candidatesTokenCount / totalTokenCount and drops
 * `thoughtsTokenCount` (no `output_token_details.reasoning`, nothing in
 * `response_metadata`). Gemini's totalTokenCount = prompt + candidates +
 * thoughts (+ toolUsePrompt), so the thinking spend is recoverable as
 * `total_tokens - input_tokens - output_tokens`.
 */
function thoughtsFromTotals(usage: Record<string, unknown>): number | null {
  const total =
    asFiniteNumber(usage.total_tokens) ?? asFiniteNumber(usage.totalTokenCount);
  const input =
    asFiniteNumber(usage.input_tokens) ??
    asFiniteNumber(usage.promptTokenCount);
  const output =
    asFiniteNumber(usage.output_tokens) ??
    asFiniteNumber(usage.candidatesTokenCount);
  if (total === null || input === null || output === null) {
    return null;
  }
  const toolUse = asFiniteNumber(usage.toolUsePromptTokenCount) ?? 0;
  const derived = total - input - output - toolUse;
  return derived > 0 ? derived : null;
}

export function tokensFromRaw(raw: unknown): {
  inputTokens: number | null;
  outputTokens: number | null;
  thinkingTokens: number | null;
  thoughtsTokenCount: number | null;
  cachedTokens: number | null;
} {
  const sources = usageSources(raw);
  if (sources.length === 0) {
    return {
      inputTokens: null,
      outputTokens: null,
      thinkingTokens: null,
      thoughtsTokenCount: null,
      cachedTokens: null,
    };
  }
  const usage = usageRecord(raw);
  let thoughts: number | null = null;
  for (const source of sources) {
    const fromSource = thoughtsFromUsage(source);
    if (fromSource !== null && fromSource > 0) {
      thoughts = fromSource;
      break;
    }
    if (thoughts === null && fromSource !== null) {
      thoughts = fromSource;
    }
  }
  if ((thoughts === null || thoughts === 0) && usage !== undefined) {
    thoughts = thoughtsFromTotals(usage) ?? thoughts;
  }
  return {
    inputTokens:
      asFiniteNumber(usage?.input_tokens) ??
      asFiniteNumber(usage?.promptTokenCount),
    outputTokens:
      asFiniteNumber(usage?.output_tokens) ??
      asFiniteNumber(usage?.candidatesTokenCount),
    thinkingTokens: thoughts,
    thoughtsTokenCount: thoughts,
    cachedTokens: cachedTokensFromRaw(raw),
  };
}

function pick(
  rec: Record<string, unknown> | undefined,
  keys: readonly string[]
): unknown {
  if (rec === undefined) return undefined;
  for (const key of keys) {
    if (rec[key] !== undefined) return rec[key];
  }
  return undefined;
}

const USAGE_KEYS = ['usage_metadata', 'usageMetadata'] as const;
const INPUT_DETAIL_KEYS = ['input_token_details', 'inputTokenDetails'] as const;
const CACHE_READ_KEYS = ['cache_read', 'cacheRead'] as const;
const RESPONSE_META_KEYS = ['response_metadata', 'responseMetadata'] as const;
const CACHED_CONTENT_KEYS = [
  'cachedContentTokenCount',
  'cached_content_token_count',
] as const;

/**
 * Implicit-cache hits for one call. Order:
 * 1. `raw.usage_metadata.input_token_details.cache_read` (LangChain
 *    normalized usage; camelCase variants accepted);
 * 2. `raw.response_metadata.usageMetadata.cachedContentTokenCount` (Gemini
 *    usage metadata; snake/camel variants accepted), then the same field on
 *    a top-level `usageMetadata` / `response.usageMetadata`.
 * Accepts the `{ parsed, raw }` structured-output wrapper.
 */
export function cachedTokensFromRaw(raw: unknown): number | null {
  const rec = asRecord(raw);
  if (rec === undefined) return null;
  if ('parsed' in rec && rec.raw !== undefined) {
    return cachedTokensFromRaw(rec.raw);
  }
  const usage = asRecord(pick(rec, USAGE_KEYS));
  const details = asRecord(pick(usage, INPUT_DETAIL_KEYS));
  const cacheRead = asFiniteNumber(pick(details, CACHE_READ_KEYS));
  if (cacheRead !== null) return cacheRead;
  const meta = asRecord(pick(rec, RESPONSE_META_KEYS));
  const candidates = [
    asRecord(pick(meta, USAGE_KEYS)),
    usage,
    asRecord(pick(asRecord(rec.response), USAGE_KEYS)),
  ];
  for (const source of candidates) {
    const cached = asFiniteNumber(pick(source, CACHED_CONTENT_KEYS));
    if (cached !== null) return cached;
  }
  return null;
}

/** Character size of a prompt (message contents, text parts only). */
export function promptCharCount(messages: readonly unknown[]): number {
  let total = 0;
  for (const message of messages) {
    const content = asRecord(message)?.content;
    if (typeof content === 'string') {
      total += content.length;
    } else if (Array.isArray(content)) {
      for (const part of content) {
        if (typeof part === 'string') total += part.length;
        else {
          const text = asRecord(part)?.text;
          if (typeof text === 'string') total += text.length;
        }
      }
    }
  }
  return total;
}
