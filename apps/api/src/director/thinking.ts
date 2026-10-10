/**
 * Gemini thinking knobs for ChatGoogleGenerativeAI.
 *
 * `@langchain/google-genai` 2.3.2 types list
 * `thinkingLevel: "LOW" | "MEDIUM" | "HIGH"` plus `thinkingBudget`.
 * `gemini-3.8-flash` rejects `MINIMAL` with HTTP 400. Production default
 * is `LOW`. If a level is rejected, wrapChatModel retries once without
 * thinkingConfig and remembers the level process-wide.
 *
 * Env `DIRECTOR_THINKING`: `minimal` | `low` | `default`.
 */

export const DIRECTOR_THINKING_IDS = ['minimal', 'low', 'default'] as const;
export type DirectorThinkingId = (typeof DIRECTOR_THINKING_IDS)[number];

/** Includes `MINIMAL`, which 2.3.2 types omit and gemini-3.8-flash rejects. */
export type GeminiThinkingLevel = 'MINIMAL' | 'LOW' | 'MEDIUM' | 'HIGH';

export interface DirectorThinking {
  thinkingLevel?: GeminiThinkingLevel;
  thinkingBudget?: number;
}

export interface ThinkingVariant {
  id: DirectorThinkingId;
  label: string;
  config: DirectorThinking | undefined;
}

export const THINKING_VARIANTS: readonly ThinkingVariant[] = [
  {
    id: 'minimal',
    label: 'thinkingLevel MINIMAL',
    config: { thinkingLevel: 'MINIMAL' },
  },
  {
    id: 'low',
    label: 'thinkingLevel LOW',
    config: { thinkingLevel: 'LOW' },
  },
  {
    id: 'default',
    label: 'provider default (no thinkingConfig)',
    config: undefined,
  },
];

/** Production default: LOW (MINIMAL 400s on gemini-3.8-flash). */
export const DEFAULT_DIRECTOR_THINKING_ID: DirectorThinkingId = 'low';

export const DEFAULT_DIRECTOR_THINKING: DirectorThinking = {
  thinkingLevel: 'LOW',
};

const unsupportedThinkingLevels = new Set<string>();

export function resetUnsupportedThinkingLevels(): void {
  unsupportedThinkingLevels.clear();
}

export function rememberUnsupportedThinkingLevel(level: string): void {
  const trimmed = level.trim().toUpperCase();
  if (trimmed.length > 0) {
    unsupportedThinkingLevels.add(trimmed);
  }
}

export function isThinkingLevelUnsupported(
  level: string | undefined
): boolean {
  if (level === undefined) {
    return false;
  }
  return unsupportedThinkingLevels.has(level.trim().toUpperCase());
}

export function isUnsupportedThinkingLevelError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  const status =
    typeof err === 'object' && err !== null && 'status' in err
      ? err.status
      : undefined;
  const is400 =
    status === 400 ||
    status === '400' ||
    /\[400\b/.test(message) ||
    /\b400\b/.test(message);
  return (
    is400 &&
    /thinking level/i.test(message) &&
    /not supported/i.test(message)
  );
}

export function isDirectorThinkingId(
  value: string
): value is DirectorThinkingId {
  return (DIRECTOR_THINKING_IDS as readonly string[]).includes(value);
}

export function resolveDirectorThinkingId(
  raw: string | undefined
): DirectorThinkingId {
  if (raw === undefined) {
    return DEFAULT_DIRECTOR_THINKING_ID;
  }
  const trimmed = raw.trim().toLowerCase();
  if (trimmed.length === 0) {
    return DEFAULT_DIRECTOR_THINKING_ID;
  }
  if (isDirectorThinkingId(trimmed)) {
    return trimmed;
  }
  throw new Error(
    `Unknown DIRECTOR_THINKING "${raw}" (use minimal, low, or default)`
  );
}

export function thinkingVariantById(
  id: string | undefined
): ThinkingVariant | undefined {
  if (id === undefined) {
    return undefined;
  }
  return THINKING_VARIANTS.find((item) => item.id === id);
}

export function thinkingConfigForId(
  id: DirectorThinkingId
): DirectorThinking | undefined {
  const config = thinkingVariantById(id)?.config;
  if (
    config?.thinkingLevel !== undefined &&
    isThinkingLevelUnsupported(config.thinkingLevel)
  ) {
    return undefined;
  }
  return config;
}

export function thinkingConfigFor(
  thinking: DirectorThinking | undefined
): DirectorThinking | undefined {
  if (thinking === undefined) {
    return undefined;
  }
  if (thinking.thinkingLevel !== undefined) {
    if (isThinkingLevelUnsupported(thinking.thinkingLevel)) {
      return undefined;
    }
    return { thinkingLevel: thinking.thinkingLevel };
  }
  if (thinking.thinkingBudget !== undefined) {
    return { thinkingBudget: thinking.thinkingBudget };
  }
  return DEFAULT_DIRECTOR_THINKING;
}
