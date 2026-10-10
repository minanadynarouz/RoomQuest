/**
 * Shared health pre-warm flag (landing + director).
 * No schema/DOM imports — must stay out of the landing gzip budget.
 */

/** GET path used to wake a sleeping Render instance. */
export const HEALTH_PATH = '/api/health';

/** One-time first `/levels` budget while the health pre-warm is still pending. */
export const DIRECTOR_COLD_START_BUDGET_MS = 20_000;

let started = false;
let answered = false;

export function markHealthPrewarmStarted(): void {
  started = true;
}

export function markHealthPrewarmAnswered(): void {
  answered = true;
}

/** True only if landing actually fired a pre-warm that has not settled. */
export function shouldUseColdStartBudget(): boolean {
  return started && !answered;
}

export function resetHealthPrewarmForTests(): void {
  started = false;
  answered = false;
}

/** Skip when the director will never hit the API. */
export function shouldSkipHealthPrewarm(search: string): boolean {
  const query = search.startsWith('?') ? search.slice(1) : search;
  const director = new URLSearchParams(query).get('director');
  return director === 'off' || director === 'mock';
}
