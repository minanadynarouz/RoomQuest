/**
 * `@roomquest/level-core` plan validator (ticket B-03).
 *
 * Public API, consumed by the NestJS director and by the Vite client.
 * Stable: do not rename exports or `Issue.code` strings without a
 * schema-level migration.
 */

export { clampParTimeMs } from './clamp-par';
export { validatePlan } from './validate-plan';
export { ISSUE_CODES } from './types';
export type { Issue, IssueCode, ValidationResult } from './types';
