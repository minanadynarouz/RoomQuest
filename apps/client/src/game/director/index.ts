/**
 * Director client - F-03
 * Pure TypeScript, no DOM, IWSDK or Three.js imports
 */

export {
  DIRECTOR_BUDGET_MS,
  LEVELS_PATH,
  DEFAULT_CLIENT_VERSION,
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
  ValidateFn,
  ValidateResult,
  KvStore,
  RequestPlanOverrides,
} from './types.js';
export { parseDirectorFlags } from './flags.js';
export { getOrCreateDeviceId } from './device-id.js';
export { stubGenerate, schemaValidate } from './fallback.js';
export { createDirectorClient } from './client.js';
export { createDirectorClientFromEnv } from './factory.js';
export type { DirectorEnv } from './factory.js';
export { applyDirectorResult } from './apply.js';
