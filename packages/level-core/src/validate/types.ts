import type { RelaxedRule } from '@roomquest/schema';

/**
 * Typed issues returned by {@link validatePlan}.
 *
 * `code` is a stable discriminant for programmatic repair (B-04) and for
 * feeding a concise list back to the LLM. Messages are human-readable and
 * specific so a repair call can act on them.
 */

export const ISSUE_CODES = [
  'SCHEMA_INVALID',
  'UNKNOWN_SURFACE',
  'LABEL_NOT_ALLOWED',
  'HEIGHT_OUT_OF_RANGE',
  'AREA_TOO_SMALL',
  'GAP_TOO_WIDE',
  'GAP_TOO_NARROW',
  'DELTA_HEIGHT_TOO_LARGE',
  'FLOOR_RUN_TOO_SHORT',
  'OUT_OF_REACH',
  'SLOPE_TOO_STEEP',
  'START_EQUALS_GOAL',
  'GOAL_UNREACHABLE',
  'BEAT_NOT_COMPLETABLE',
  'UNKNOWN_PLACEMENT_REF',
  'PAR_OUT_OF_RANGE',
  'MISSING_SECOND_SURFACE',
  'PATH_DISTANCE_TOO_SHORT',
  'TOO_MANY_OF_PIECE',
  'GATE_WITHOUT_LEVER',
  'MISSING_START_HUT',
  'MISSING_GOAL_SHRINE',
  'HUT_NOT_ON_START',
  'SHRINE_NOT_ON_GOAL',
  'NOT_ON_PATH',
  'DUPLICATE_PLACEMENT_ID',
  'INVALID_LINK',
  'SAME_SURFACE_PAIR',
] as const;

export type IssueCode = (typeof ISSUE_CODES)[number];

/**
 * One validation failure. Discriminated by `code`.
 */
export interface Issue {
  /** Stable machine-readable code */
  code: IssueCode;
  /** Concise, specific message for LLM repair */
  message: string;
  /** Placement that failed, when the issue is piece-local */
  placementId?: string;
  /** Surface that failed, when the issue is surface-local */
  surfaceId?: string;
}

/**
 * Result of {@link validatePlan}. `ok` is true iff `issues` is empty.
 * `relaxed` lists graph-aware waivers that were applied, in canonical order.
 */
export interface ValidationResult {
  ok: boolean;
  issues: Issue[];
  relaxed: RelaxedRule[];
}

export function issue(
  code: IssueCode,
  message: string,
  extra?: { placementId?: string; surfaceId?: string }
): Issue {
  const result: Issue = { code, message };
  if (extra?.placementId !== undefined) {
    result.placementId = extra.placementId;
  }
  if (extra?.surfaceId !== undefined) {
    result.surfaceId = extra.surfaceId;
  }
  return result;
}
