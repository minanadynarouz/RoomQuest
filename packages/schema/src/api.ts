import { z } from 'zod';
import { SurfaceGraph } from './surface.js';
import { LevelPlan, Theme, Tier, PlanSource } from './level.js';

/**
 * Why the API returned a procedural plan instead of Gemini.
 * Response-only — never part of LevelPlanLLM (Gemini structured output).
 */
export const FallbackReason = z.enum([
  'llm-quota',
  'llm-invalid',
  'llm-timeout',
  'llm-error',
  'llm-parse',
  'schema-resolve',
]);
export type FallbackReason = z.infer<typeof FallbackReason>;

/** Director stage that decided to fall back to generatePlan. */
export const FallbackStage = z.enum([
  'draft',
  'local',
  'llm-repair',
  'quota',
]);
export type FallbackStage = z.infer<typeof FallbackStage>;

/** Graph-capacity waivers (#60 / #65). Order is always minPath, hutTable, portalFov. */
export const RelaxedRule = z.enum(['minPath', 'hutTable', 'portalFov']);
export type RelaxedRule = z.infer<typeof RelaxedRule>;

export const RELAXED_RULE_ORDER = [
  'minPath',
  'hutTable',
  'portalFov',
] as const satisfies readonly RelaxedRule[];

export function orderRelaxedRules(
  rules: readonly RelaxedRule[]
): RelaxedRule[] {
  const seen = new Set(rules);
  return RELAXED_RULE_ORDER.filter((rule) => seen.has(rule));
}

/**
 * API request/response types
 * Architecture §6
 */

/**
 * Request to generate a level plan
 * POST /api/v1/levels
 */
export const LevelRequest = z.object({
  /** Surface graph from scene understanding */
  graph: SurfaceGraph,
  /** Date string YYYY-MM-DD for daily seed */
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  /** Difficulty tier */
  tier: Tier,
  /** Recently used themes to avoid repetition (max 3) */
  recentThemes: z.array(Theme).max(3).optional(),
});
export type LevelRequest = z.infer<typeof LevelRequest>;

/**
 * Successful level generation response
 */
export const LevelResponse = z.object({
  /** Generated level plan */
  plan: LevelPlan,
  /** How the plan was generated */
  source: PlanSource,
  /** Cache key for this level */
  cacheKey: z.string(),
  /** Model name if from LLM */
  model: z.string().optional(),
  /** Prompt version used */
  promptVersion: z.string(),
  /** Total latency in milliseconds */
  latencyMs: z.number(),
  /** Validator repairs applied (if any) */
  repairs: z.array(z.string()),
  /** Present when source is procedural because Gemini was skipped or failed. */
  fallbackReason: FallbackReason.optional(),
  /** Stage that chose the procedural fallback. Set whenever fallbackReason is. */
  fallbackStage: FallbackStage.optional(),
});
export type LevelResponse = z.infer<typeof LevelResponse>;

/**
 * Error codes for API responses
 */
export const ErrorCode = z.enum([
  'INVALID_REQUEST',
  'RATE_LIMITED',
  'INTERNAL',
  'UNKNOWN_LEVEL',
]);
export type ErrorCode = z.infer<typeof ErrorCode>;

/**
 * API error envelope
 */
export const ApiError = z.object({
  error: z.object({
    /** Error code */
    code: ErrorCode,
    /** Human-readable error message */
    message: z.string(),
    /** Zod validation issues (for INVALID_REQUEST) */
    issues: z.array(z.any()).optional(),
  }),
});
export type ApiError = z.infer<typeof ApiError>;

/**
 * Upper bound on submitted play time. Sessions target 10 minutes; one hour
 * is enough for abandoned runs without allowing multi-day junk values.
 */
export const RESULT_TIME_MS_MAX = 3_600_000;

/**
 * Session result submission
 * POST /api/v1/levels/:cacheKey/result
 */
export const ResultRequest = z.object({
  /** Anonymous device id (UUID v4), same value as `X-Device-Id` on /levels */
  deviceId: z.uuidv4(),
  /** Stars earned (0..3) */
  stars: z.number().int().min(0).max(3),
  /** Gems collected */
  gems: z.number().int().min(0),
  /** Time taken in milliseconds (positive, ≤ 1 hour) */
  timeMs: z.number().int().positive().max(RESULT_TIME_MS_MAX),
  /** Whether the level was completed */
  completed: z.boolean(),
  /** Source of the plan that was played (`LevelResponse.source`) */
  planSource: PlanSource,
});
export type ResultRequest = z.infer<typeof ResultRequest>;

/**
 * Successful insert
 * 201 `{ id }`
 */
export const ResultResponse = z.object({
  /** SessionResult primary key */
  id: z.string().min(1),
});
export type ResultResponse = z.infer<typeof ResultResponse>;

/**
 * Accepted but not persisted (no database / unreachable database)
 * 202 `{ stored: false }`
 */
export const ResultDeferred = z.object({
  stored: z.literal(false),
});
export type ResultDeferred = z.infer<typeof ResultDeferred>;

/**
 * Rate limit error with retry timing
 */
export const RateLimitError = z.object({
  error: z.object({
    code: z.literal('RATE_LIMITED'),
    message: z.string(),
    /** Seconds until retry allowed */
    retryAfterS: z.number().int().min(0),
  }),
});
export type RateLimitError = z.infer<typeof RateLimitError>;
