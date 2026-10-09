export type LlmProvider = 'google' | 'anthropic';

export type LlmCallOutcome =
  | 'ok'
  | 'invalid'
  | 'repaired'
  | 'timeout'
  | 'error';

/**
 * One LLM round-trip. B-07 eval can reuse this record; B-06 will persist
 * later. Do not log API keys.
 */
export interface LlmCallTelemetry {
  provider: LlmProvider;
  model: string;
  inputTokens: number | null;
  outputTokens: number | null;
  latencyMs: number;
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

export function tokensFromRaw(raw: unknown): {
  inputTokens: number | null;
  outputTokens: number | null;
} {
  if (typeof raw !== 'object' || raw === null) {
    return { inputTokens: null, outputTokens: null };
  }
  const usage = (raw as { usage_metadata?: unknown }).usage_metadata;
  if (typeof usage !== 'object' || usage === null) {
    return { inputTokens: null, outputTokens: null };
  }
  const meta = usage as {
    input_tokens?: unknown;
    output_tokens?: unknown;
  };
  return {
    inputTokens:
      typeof meta.input_tokens === 'number' ? meta.input_tokens : null,
    outputTokens:
      typeof meta.output_tokens === 'number' ? meta.output_tokens : null,
  };
}
