import { z } from 'zod';
import {
  DEFAULT_DIRECTOR_MODEL,
  LLM_REPAIR_MIN_REMAINING_MS,
} from '../director/director.constants';

const optionalKey = z
  .string()
  .optional()
  .transform((value) => {
    if (value === undefined || value.trim().length === 0) {
      return undefined;
    }
    return value;
  });

/**
 * Process environment validated at API startup.
 * Extra keys are stripped; missing values use the documented defaults.
 */
export const envSchema = z.object({
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  NODE_ENV: z
    .enum(['development', 'production', 'test'])
    .default('development'),
  DIRECTOR_MODE: z.enum(['mock', 'live']).default('mock'),
  CORS_ORIGINS: z
    .string()
    .default('http://localhost:5173,https://localhost:5173'),
  GIT_SHA: z
    .string()
    .optional()
    .transform((value) => {
      if (value === undefined || value.trim().length === 0) {
        return 'dev';
      }
      return value.trim();
    }),
  GOOGLE_API_KEY: optionalKey,
  DATABASE_URL: optionalKey,
  DIRECT_URL: optionalKey,
  DIRECTOR_MODEL: z
    .string()
    .optional()
    .transform((value) => {
      if (value === undefined || value.trim().length === 0) {
        return DEFAULT_DIRECTOR_MODEL;
      }
      return value.trim();
    }),
  DIRECTOR_THINKING: z
    .string()
    .optional()
    .transform((value) => {
      if (value === undefined || value.trim().length === 0) {
        return 'low';
      }
      return value.trim().toLowerCase();
    })
    .pipe(z.enum(['minimal', 'low', 'default'])),
  /**
   * Thinking level for the route-arm decoration call only
   * (DIRECTOR_PLACEMENT=route). Default `minimal`; if Gemini rejects
   * MINIMAL the call steps up to LOW (then drops thinkingConfig).
   */
  DIRECTOR_DECORATION_THINKING: z
    .string()
    .optional()
    .transform((value) => {
      if (value === undefined || value.trim().length === 0) {
        return 'minimal';
      }
      return value.trim().toLowerCase();
    })
    .pipe(z.enum(['minimal', 'low', 'default'])),
  /**
   * Route arm: fire one identical hedge decoration call when the first has
   * not returned after this many ms (shared deadline, no extension).
   * 0 disables hedging.
   */
  DIRECTOR_HEDGE_MS: z.preprocess(
    (value) =>
      typeof value === 'string' && value.trim().length === 0 ? undefined : value,
    z.coerce.number().int().min(0).max(60_000).default(3000)
  ),
  /**
   * Background Gemini `models.get` at boot (TLS/DNS warm-up). Unset: on only
   * when DIRECTOR_MODE=live and GOOGLE_API_KEY is set. Never in tests/CI.
   */
  DIRECTOR_WARMUP: z
    .string()
    .optional()
    .transform((value, ctx) => {
      const v = value?.trim().toLowerCase() ?? '';
      if (v === '') return undefined;
      if (['1', 'true', 'on', 'yes'].includes(v)) return true;
      if (['0', 'false', 'off', 'no'].includes(v)) return false;
      ctx.addIssue({ code: 'custom', message: 'DIRECTOR_WARMUP must be on/off' });
      return z.NEVER;
    }),
  /**
   * Only attempt the second (LLM repair) Gemini call when at least this many
   * ms of the director's LLM window remain; otherwise go procedural with
   * fallbackReason `llm-invalid`.
   */
  LLM_REPAIR_MIN_REMAINING_MS: z.coerce
    .number()
    .int()
    .min(0)
    .max(60_000)
    .default(LLM_REPAIR_MIN_REMAINING_MS),
  /**
   * `uv` (default): Gemini returns surface+u+v. `slot`: Gemini picks one of
   * the per-request hinted slot ids; the server resolves them to surface+u+v.
   * `route`: level-core builds candidate routes; Gemini only picks one and
   * decorates it (one call, no LLM repair).
   */
  DIRECTOR_PLACEMENT: z
    .string()
    .optional()
    .transform((value) => {
      if (value === undefined || value.trim().length === 0) {
        return 'uv';
      }
      return value.trim().toLowerCase();
    })
    .pipe(z.enum(['uv', 'slot', 'route'])),
  /** Seconds to skip Gemini after 429 / RESOURCE_EXHAUSTED when the error has no Retry-After. */
  LLM_QUOTA_COOLDOWN_S: z.coerce.number().int().min(1).default(600),
  /** Global UTC daily cap on live Gemini calls. Cache hits do not count. */
  LLM_DAILY_MAX: z.coerce.number().int().min(1).default(150),
});

export type Env = z.infer<typeof envSchema>;

export function validateEnv(config: Record<string, unknown>): Env {
  const parsed = envSchema.safeParse(config);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('; ');
    throw new Error(`Invalid environment: ${issues}`);
  }
  return parsed.data;
}

export function isLlmConfigured(env: Pick<Env, 'GOOGLE_API_KEY'>): boolean {
  return env.GOOGLE_API_KEY !== undefined;
}
