import type { Issue } from '@roomquest/level-core';

/** `validatePlan` issue as recorded by the eval harness (code + path). */
export interface IssueTrace {
  code: string;
  path: string;
}

export type RepairStage = 'local' | 'llm';

/** Stage that produced the returned plan. */
export type DirectorStage =
  | 'first-try'
  | 'snap'
  | 'repair-route'
  | 'repair-plan'
  | 'llm-repair'
  | 'route'
  | 'procedural';

export const DIRECTOR_STAGES = [
  'first-try',
  'snap',
  'repair-route',
  'repair-plan',
  'llm-repair',
  'route',
  'procedural',
] as const satisfies readonly DirectorStage[];

/** Where the LLM path stopped when the answer is procedural. */
export type DirectorFailurePoint =
  | 'mode'
  | 'quota-precheck'
  | 'draft'
  | 'slot-resolve'
  | 'llm-repair-gate'
  | 'llm-repair'
  | 'route-candidates'
  | 'route-decoration'
  | 'route-validate'
  | 'director';

export const DIRECTOR_FAILURE_POINTS = [
  'mode',
  'quota-precheck',
  'draft',
  'slot-resolve',
  'llm-repair-gate',
  'llm-repair',
  'route-candidates',
  'route-decoration',
  'route-validate',
  'director',
] as const satisfies readonly DirectorFailurePoint[];

export interface ValidationTrace {
  firstTry: IssueTrace[];
  afterLocal: IssueTrace[] | null;
  afterLlmRepair: IssueTrace[] | null;
}

export function issuePath(issue: Issue): string {
  const parts: string[] = [];
  if (issue.placementId !== undefined) {
    parts.push(`placement:${issue.placementId}`);
  }
  if (issue.surfaceId !== undefined) {
    parts.push(`surface:${issue.surfaceId}`);
  }
  return parts.join('/');
}

export function traceIssues(issues: readonly Issue[]): IssueTrace[] {
  return issues.map((item) => ({
    code: item.code,
    path: issuePath(item),
  }));
}

export function emptyValidationTrace(): ValidationTrace {
  return {
    firstTry: [],
    afterLocal: null,
    afterLlmRepair: null,
  };
}
