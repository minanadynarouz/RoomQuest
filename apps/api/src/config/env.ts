import { z } from 'zod';

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
  ANTHROPIC_API_KEY: optionalKey,
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

export function isLlmConfigured(
  env: Pick<Env, 'GOOGLE_API_KEY' | 'ANTHROPIC_API_KEY'>
): boolean {
  return (
    env.GOOGLE_API_KEY !== undefined || env.ANTHROPIC_API_KEY !== undefined
  );
}
