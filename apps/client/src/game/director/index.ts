/**
 * Director client - F-03
 * Pure TypeScript, no DOM, IWSDK or Three.js imports
 */

export {
  DIRECTOR_BUDGET_MS,
  DIRECTOR_COLD_START_BUDGET_MS,
  HEALTH_PATH,
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
  DirectorRequestEndInfo,
  FallbackReason,
  FetchLike,
  FetchHeadersLike,
  RepairedBy,
  RelaxedRule,
  SnapFn,
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
  parseRetryAfterHeader,
  cooldownUntilMs,
  remainingRetryAfterS,
} from './rate-limit.js';
export { createDirectorClient, snapshotSurfaceGraph } from './client.js';
export { createDirectorClientFromEnv } from './factory.js';
export type { DirectorEnv } from './factory.js';
export { applyDirectorResult } from './apply.js';
export { recoverPlan } from './recover.js';
export type { RecoveredPlan, RecoverPlanOptions } from './recover.js';
export {
  ROOM_UNPLAYABLE,
  mergeRelaxed,
  readRelaxed,
} from './schema-pending.js';
export type { RoomUnplayableReason } from './schema-pending.js';
