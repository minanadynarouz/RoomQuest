/**
 * F-07 result posting. Local B-09 adapters until PR #28 merges.
 */

export { procLevelKey, PROC_LEVEL_KEY_RE, parseProcLevelKey } from './proc-key.js';
export type { ProcTier, ProcLevelKeyParts } from './proc-key.js';
export {
  ResultRequestBody,
  ResultLevelKey,
  RESULT_TIME_MS_MAX,
} from './schema.js';
export {
  createResultPoster,
  resolveLevelKey,
  RESULT_PATH_SUFFIX,
} from './poster.js';
export type {
  ResultFetch,
  ResultPoster,
  PostLevelResultInput,
  ResolveLevelKeyInput,
  ResultPosterOptions,
} from './poster.js';
