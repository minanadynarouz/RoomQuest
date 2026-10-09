import { describe, it, expect } from 'vitest';
import type { Issue } from '@roomquest/level-core';
import { fallbackReasonFromIssues, issueCodesOf } from './issues.js';

describe('fallbackReasonFromIssues', () => {
  it('maps UNKNOWN_SURFACE to graph-mismatch', () => {
    const issues: Issue[] = [
      {
        code: 'UNKNOWN_SURFACE',
        message: 'start surface "s1" is not in the graph',
        surfaceId: 's1',
      },
    ];
    expect(fallbackReasonFromIssues(issues)).toBe('graph-mismatch');
    expect(issueCodesOf(issues)).toEqual(['UNKNOWN_SURFACE']);
  });

  it('maps schema-only failures to invalid-plan', () => {
    const issues: Issue[] = [
      { code: 'SCHEMA_INVALID', message: 'plan.u: too big' },
    ];
    expect(fallbackReasonFromIssues(issues)).toBe('invalid-plan');
  });

  it('maps mixed graph-fit issues to graph-mismatch', () => {
    const issues: Issue[] = [
      { code: 'UNKNOWN_SURFACE', message: 'missing s4', surfaceId: 's4' },
      { code: 'GOAL_UNREACHABLE', message: 'no path' },
    ];
    expect(fallbackReasonFromIssues(issues)).toBe('graph-mismatch');
  });
});
