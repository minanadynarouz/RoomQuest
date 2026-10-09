/**
 * Map `validatePlan` issue codes onto F-03 fallback reasons.
 *
 * Fixture-id mismatch (B-02 mock until B-05) produces `UNKNOWN_SURFACE`
 * and must stay `graph-mismatch`, logged at info — not an error.
 */

import type { Issue, IssueCode } from '@roomquest/level-core';
import type { FallbackReason } from './types.js';

const INVALID_PLAN_CODES: ReadonlySet<IssueCode> = new Set([
  'SCHEMA_INVALID',
  'PAR_OUT_OF_RANGE',
]);

/**
 * Choose a fallback reason from typed validator issues.
 * `UNKNOWN_SURFACE` (and any other graph-fit failure) → `graph-mismatch`.
 * Schema-only failures → `invalid-plan`.
 */
export function fallbackReasonFromIssues(issues: Issue[]): FallbackReason {
  if (issues.length === 0) {
    return 'invalid-plan';
  }
  if (issues.every((item) => INVALID_PLAN_CODES.has(item.code))) {
    return 'invalid-plan';
  }
  return 'graph-mismatch';
}

export function issueCodesOf(issues: Issue[]): IssueCode[] {
  return issues.map((item) => item.code);
}
