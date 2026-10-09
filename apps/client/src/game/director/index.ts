/**
 * Director client - F-03
 * Pure TypeScript, no DOM, IWSDK or Three.js imports
 */

export {
  DIRECTOR_BUDGET_MS,
  LEVELS_PATH,
  DEFAULT_CLIENT_VERSION,
  DEFAULT_TIER,
  DEVICE_ID_STORAGE_KEY,
} from './types.js';
export type {
  DirectorMode,
  DirectorFlags,
  DirectorResult,
  DirectorClient,
  DirectorClientOptions,
  FallbackReason,
  FetchLike,
  GenerateFn,
  RepairFn,
  ValidateFn,
  ValidateResult,
  KvStore,
  RequestPlanOverrides,
} from './types.js';
export type { ErrorCode } from '@roomquest/schema';
export { parseDirectorFlags } from './flags.js';
export { getOrCreateDeviceId } from './device-id.js';
export { fallbackReasonFromIssues } from './issues.js';
export {
  parseRetryAfterS,
  cooldownUntilMs,
  remainingRetryAfterS,
} from './rate-limit.js';
export { createDirectorClient, snapshotSurfaceGraph } from './client.js';
export { createDirectorClientFromEnv } from './factory.js';
export type { DirectorEnv } from './factory.js';
export { applyDirectorResult } from './apply.js';
