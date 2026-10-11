/**
 * `@roomquest/level-core` plan validator (ticket B-03).
 *
 * Public API, consumed by the NestJS director and by the Vite client.
 * Stable: do not rename exports or `Issue.code` strings without a
 * schema-level migration.
 */

export { clampParTimeMs } from './clamp-par';
export { validatePlan } from './validate-plan';
export { relaxedRulesFor } from './relaxed-rules';
export {
  PLAYER_REACH_VALUES,
  RAMP_FLOOR_RUN_PER_DH,
  VALIDATION_LIMITS,
} from './limits';
export {
  GEOM_EPS_M,
  MAX_VIEW_ANGLE_DEG,
  MIN_PATH_DISTANCE_M,
} from './graph-utils';
export { ISSUE_CODES } from './types';
export type { Issue, IssueCode, ValidationResult } from './types';
export { bfsPath, bfsReachable, explorerAdjacency } from './graph-utils';
export { pairFitsPiece, pieceFitsSurface } from './piece-fits';
export {
  graphCanSeparateHutAndShrine,
  graphHasCatalogHut,
  graphHasPlayableView,
} from './graph-capacity';
