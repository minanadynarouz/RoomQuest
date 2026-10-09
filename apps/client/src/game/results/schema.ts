/**
 * Local result-request schema (F-07).
 *
 * TODO(B-09): replace with `ResultRequest`, `ResultLevelKey`, and
 * `RESULT_TIME_MS_MAX` from `@roomquest/schema` once PR #28 merges.
 * Body fields match that PR: deviceId, stars, gems, timeMs, completed,
 * planSource.
 */

import { z } from 'zod';
import { PlanSource } from '@roomquest/schema';
import { PROC_LEVEL_KEY_PREFIX, PROC_LEVEL_KEY_RE } from './proc-key.js';

/** Upper bound on submitted play time (1 hour), matching B-09. */
export const RESULT_TIME_MS_MAX = 3_600_000;

/** UUID v4, same value as `X-Device-Id` on /levels. */
const UuidV4 = z
  .string()
  .regex(
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    'expected UUID v4'
  );

/**
 * Path param for `POST /api/v1/levels/:levelKey/result`.
 * Director cache keys are opaque. Anything that starts with `proc:` must
 * match `proc:<seed>:<tier>`.
 */
export const ResultLevelKey = z
  .string()
  .min(1)
  .refine(
    (value) =>
      !value.startsWith(PROC_LEVEL_KEY_PREFIX) || PROC_LEVEL_KEY_RE.test(value),
    { message: 'expected proc:<seed>:<tier> with tier easy|normal' }
  );
export type ResultLevelKey = z.infer<typeof ResultLevelKey>;

export const ResultRequestBody = z.object({
  deviceId: UuidV4,
  stars: z.number().int().min(0).max(3),
  gems: z.number().int().min(0),
  timeMs: z.number().int().positive().max(RESULT_TIME_MS_MAX),
  completed: z.boolean(),
  planSource: PlanSource,
});
export type ResultRequestBody = z.infer<typeof ResultRequestBody>;
