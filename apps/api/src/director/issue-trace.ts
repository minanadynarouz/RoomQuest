import type { Issue } from '@roomquest/level-core';

/** `validatePlan` issue as recorded by the eval harness (code + path). */
export interface IssueTrace {
  code: string;
  path: string;
}

export type RepairStage = 'local' | 'llm';

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
