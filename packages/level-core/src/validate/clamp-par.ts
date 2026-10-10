import { PAR_TIME_MAX_MS, PAR_TIME_MIN_MS } from '@roomquest/schema';

/**
 * Clamp a raw par-time (ms) into the legal LevelPlan range and round it
 * to an integer.
 *
 * The director pipeline runs this when hydrating compact LLM output **before**
 * `LevelPlan.parse()`. {@link validatePlan} reports `PAR_OUT_OF_RANGE`
 * only when the value it is given was not already clamped into range.
 *
 * Non-finite inputs (NaN, ±Infinity) snap to {@link PAR_TIME_MIN_MS}.
 *
 * @param ms - Raw par time in milliseconds
 * @returns Integer in `[PAR_TIME_MIN_MS, PAR_TIME_MAX_MS]`
 */
export function clampParTimeMs(ms: number): number {
  if (!Number.isFinite(ms)) {
    return PAR_TIME_MIN_MS;
  }
  const rounded = Math.round(ms);
  if (rounded < PAR_TIME_MIN_MS) {
    return PAR_TIME_MIN_MS;
  }
  if (rounded > PAR_TIME_MAX_MS) {
    return PAR_TIME_MAX_MS;
  }
  return rounded;
}
