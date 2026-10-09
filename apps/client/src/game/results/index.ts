/**
 * F-07 result posting. Level keys and the request body come from
 * `@roomquest/schema` (B-09).
 */

export {
  PROC_LEVEL_KEY_RE,
  RESULT_TIME_MS_MAX,
  ResultLevelKey,
  ResultRequest,
  parseProcLevelKey,
  procLevelKey,
} from '@roomquest/schema';
export type { ProcLevelKeyParts } from '@roomquest/schema';
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
