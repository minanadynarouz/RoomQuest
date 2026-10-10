import type { Tier } from '@roomquest/schema';
import { DIRECTOR_BUDGET_MS } from '../src/director/director.constants';

/** Cap on room fixtures (architecture B-07: 5 rooms × 4 seeds × 2 tiers). */
export const EVAL_MAX_ROOMS = 5;

/** Default director invocations (`--runs`). */
export const EVAL_DEFAULT_RUNS = 20;

/**
 * Dates mixed into `makeDailySeed(roomHash, date)`. Four distinct days so
 * each seed is unique without inventing a second seed channel.
 */
export const EVAL_SEED_DATES = [
  '2026-10-01',
  '2026-10-02',
  '2026-10-03',
  '2026-10-04',
] as const;

export const EVAL_TIERS: readonly Tier[] = ['easy', 'normal'];

/** Bar from architecture B-07 / PRD US-12: ≥ 90% valid after repair. */
export const EVAL_BAR_VALID_AFTER_REPAIR_PCT = 90;

/** Bar: p95 director latency ≤ the 7 s whole-request budget. */
export const EVAL_BAR_P95_MS = DIRECTOR_BUDGET_MS;

export const EVAL_REPORT_DIR_SEGMENTS = ['docs', 'eval'] as const;
