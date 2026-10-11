import {
  AIMessage,
  HumanMessage,
  SystemMessage,
  type BaseMessage,
} from '@langchain/core/messages';
import {
  buildLevelDecorationGeminiSchema,
  LevelDecorationLLM,
  type LevelDecorationEnums,
} from '@roomquest/schema';
import { sanitizeDecorationCandidate } from './decoration-sanitizer';
import {
  DECORATION_BANNED_WORDS,
  type DecorationMessage,
} from './prompts/decoration';
import type { StructuredCallOptions } from './structured-chat';

/** Decoration prompt turns → LangChain messages (system, few-shots, user). */
export function toLangchainMessages(
  messages: readonly DecorationMessage[]
): BaseMessage[] {
  return messages.map((message) => {
    if (message.role === 'system') {
      return new SystemMessage(message.content);
    }
    if (message.role === 'assistant') {
      return new AIMessage(message.content);
    }
    return new HumanMessage(message.content);
  });
}

/**
 * Per-request structured-output options for the route arm: the converted
 * Gemini-safe JSON schema (never a zod object) built from the candidate
 * enums.
 */
export function routeCallOptions(
  enums: LevelDecorationEnums
): StructuredCallOptions {
  return {
    responseSchema: buildLevelDecorationGeminiSchema(enums),
    schemaName: 'LevelDecoration',
  };
}

export type RouteDecorationParse =
  | {
      kind: 'ok';
      decoration: LevelDecorationLLM;
      droppedLines: number;
      linesIn: number;
      dropReasons: string[];
    }
  | { kind: 'parse-failed'; error: string; droppedLines: number };

/**
 * Sanitize `lines` (control chars, empty/overlong, un-offered beats, max 8)
 * then parse the decoration shape with zod. `routeId` / twist / hazards are
 * parsed loosely here on purpose: `applyDecoration` rejects an unknown
 * route id (UNKNOWN_ROUTE_ID → `llm-invalid`) and replaces un-offered
 * twist/hazard choices with deterministic defaults.
 */
export function parseRouteDecoration(
  raw: unknown,
  enums: LevelDecorationEnums
): RouteDecorationParse {
  const { candidate, report } = sanitizeDecorationCandidate(raw, {
    beats: enums.beats,
  });
  const parsed = LevelDecorationLLM.safeParse(candidate);
  if (!parsed.success) {
    return {
      kind: 'parse-failed',
      error: parsed.error.issues.map((issue) => issue.message).join('; '),
      droppedLines: report.droppedLines,
    };
  }
  return {
    kind: 'ok',
    decoration: parsed.data,
    droppedLines: report.droppedLines,
    linesIn: report.linesIn,
    dropReasons: report.dropReasons,
  };
}

/** Whole-word, case-insensitive hits of DECORATION_BANNED_WORDS in lines. */
export function countBannedWordHits(
  lines: readonly { text: string }[]
): number {
  let hits = 0;
  for (const line of lines) {
    const words = line.text.toLowerCase().match(/[a-z]+/gu) ?? [];
    for (const word of words) {
      if ((DECORATION_BANNED_WORDS as readonly string[]).includes(word)) {
        hits += 1;
      }
    }
  }
  return hits;
}
