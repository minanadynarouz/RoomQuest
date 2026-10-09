/**
 * Whole-request deadline for one POST /levels miss (architecture §6).
 * The client aborts at 8 s, so this 7 s budget covers every director step
 * (first LLM call, provider fallback, local repair, LLM repair, generatePlan)
 * measured from request arrival, with time left to respond before 7 s.
 */
export const DIRECTOR_BUDGET_MS = 7000;

/**
 * Minimum remaining LLM window required before trying the Anthropic fallback
 * after a primary-provider error. Remaining is measured until the LLM abort
 * (budget minus the procedural reserve).
 */
export const FALLBACK_MIN_REMAINING_MS = 3000;

/**
 * Skip the LLM repair call when less than this much of the LLM window remains.
 */
export const LLM_REPAIR_MIN_REMAINING_MS = 2000;

/**
 * Headroom inside the 7 s budget so generatePlan and the HTTP response finish
 * before the deadline. LLM work is aborted at budget − reserve.
 */
export const PROCEDURAL_RESERVE_MS = 250;

export const DEFAULT_DIRECTOR_MODEL = 'gemini-3.8-flash';
export const DEFAULT_FALLBACK_MODEL = 'claude-haiku-4-5';

export const DIRECTOR_TEMPERATURE = 0.7;
