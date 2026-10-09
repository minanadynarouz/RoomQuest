/** Total LLM budget for one POST /levels miss (architecture §6). */
export const DIRECTOR_BUDGET_MS = 7000;

/**
 * Minimum remaining budget required before trying the Anthropic fallback
 * after a primary-provider error.
 */
export const FALLBACK_MIN_REMAINING_MS = 3000;

export const DEFAULT_DIRECTOR_MODEL = 'gemini-3.8-flash';
export const DEFAULT_FALLBACK_MODEL = 'claude-haiku-4-5';

export const DIRECTOR_TEMPERATURE = 0.7;
