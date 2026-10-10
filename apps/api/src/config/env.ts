import { z } from 'zod';
import { DEFAULT_DIRECTOR_MODEL } from '../director/director.constants';

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
   * LLM placement encoding. `uv` is today's compact `s`/`u`/`v`. `slot`
   * asks Gemini for hinted slot ids; the server resolves them to surface+u+v
   * before validate / send so the client never sees the seed.
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
    .pipe(z.enum(['uv', 'slot'])),
  /** Seconds to skip Gemini after 429 / RESOURCE_EXHAUSTED when the error has no Retry-After. */
  LLM_QUOTA_COOLDOWN_S: z.coerce.number().int().min(1).default(600),
  /**
   * Skip the LLM repair call unless at least this many ms remain in the
   * LLM window (p95 of a first-try call). Default 3500.
   */
  LLM_REPAIR_MIN_REMAINING_MS: z.coerce.number().int().min(1).default(3500),
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
