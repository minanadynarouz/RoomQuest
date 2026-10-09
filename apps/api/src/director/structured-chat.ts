import type { BaseMessageLike } from '@langchain/core/messages';
import type { LlmProvider } from './telemetry';

export interface StructuredPlanCall {
  parsed: unknown;
  raw?: unknown;
}

/**
 * Provider-agnostic structured-output invoker. Production wraps a LangChain
 * chat model; tests wrap FakeListChatModel. The post-MVP adapt endpoint
 * can reuse this.
 */
export interface StructuredChat {
  readonly provider: LlmProvider;
  readonly model: string;
  invokeStructured(
    messages: BaseMessageLike[],
    signal: AbortSignal
  ): Promise<StructuredPlanCall>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function unwrapStructured(result: unknown): StructuredPlanCall {
  if (isRecord(result) && 'parsed' in result) {
    return { parsed: result.parsed, raw: result.raw };
  }
  return { parsed: result };
}
