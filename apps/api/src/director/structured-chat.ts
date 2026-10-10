import type { BaseMessageLike } from '@langchain/core/messages';
import type { LlmProvider } from './telemetry';

export interface StructuredPlanCall {
  parsed: unknown;
  raw?: unknown;
  /** Time-to-first-token in ms when the provider streamed; otherwise null. */
  ttftMs?: number | null;
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

export function textFromRaw(raw: unknown): string | undefined {
  if (typeof raw === 'string') {
    return raw;
  }
  if (!isRecord(raw)) {
    return undefined;
  }
  const content = raw.content;
  if (typeof content === 'string') {
    return content;
  }
  if (!Array.isArray(content)) {
    return undefined;
  }
  const texts = content
    .map((part) => {
      if (typeof part === 'string') {
        return part;
      }
      if (isRecord(part) && typeof part.text === 'string') {
        return part.text;
      }
      return '';
    })
    .join('');
  return texts.length > 0 ? texts : undefined;
}

/** Strip a single ``` / ```json fence wrapper so JSON.parse can run. */
export function stripCodeFences(text: string): string {
  const trimmed = text.trim();
  const fenced = /^```(?:json)?\s*\r?\n?([\s\S]*?)\r?\n?```$/i.exec(trimmed);
  if (fenced?.[1] !== undefined) {
    return fenced[1].trim();
  }
  return trimmed;
}

/** JSON object from an `includeRaw` AIMessage when LangChain's parser yields null. */
export function jsonFromRaw(raw: unknown): unknown {
  const text = textFromRaw(raw);
  if (text === undefined) {
    return isRecord(raw) && !('content' in raw) ? raw : undefined;
  }
  try {
    return JSON.parse(stripCodeFences(text)) as unknown;
  } catch {
    return undefined;
  }
}

/**
 * Prefer LangChain's parsed object; if parse failed (`parsed` is null) recover
 * the raw JSON so local `repairPlan` can run without a second model call.
 */
export function structuredCandidate(call: StructuredPlanCall): unknown {
  return call.parsed ?? jsonFromRaw(call.raw);
}

export function unwrapStructured(result: unknown): StructuredPlanCall {
  if (isRecord(result) && 'parsed' in result) {
    const raw = result.raw;
    const parsed = result.parsed ?? jsonFromRaw(raw);
    return { parsed, raw };
  }
  return { parsed: result };
}
