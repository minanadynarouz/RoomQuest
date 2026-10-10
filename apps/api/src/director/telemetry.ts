export type LlmProvider = 'google';

export type LlmCallOutcome =
  'ok' | 'invalid' | 'repaired' | 'timeout' | 'error';

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
    // Gemini SDK generateContent result: { response: { usageMetadata } }
    response === undefined
      ? undefined
      : asRecord(asRecord(response.usageMetadata)),
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

export function tokensFromRaw(raw: unknown): {
  inputTokens: number | null;
  outputTokens: number | null;
  thinkingTokens: number | null;
  thoughtsTokenCount: number | null;
} {
  const sources = usageSources(raw);
  if (sources.length === 0) {
    return {
      inputTokens: null,
      outputTokens: null,
      thinkingTokens: null,
      thoughtsTokenCount: null,
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
  return {
    inputTokens:
      asFiniteNumber(usage?.input_tokens) ??
      asFiniteNumber(usage?.promptTokenCount),
    outputTokens:
      asFiniteNumber(usage?.output_tokens) ??
      asFiniteNumber(usage?.candidatesTokenCount),
    thinkingTokens: thoughts,
    thoughtsTokenCount: thoughts,
  };
}
