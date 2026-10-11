/**
 * Local geometry repair before `repairPlan`.
 * validate → snapPlacementsToSlots → validate → repairPlan → validate.
 */

import {
  repairPlan,
  snapPlacementsToSlots,
  validatePlan,
  type Issue,
  type SnapResult,
} from '@roomquest/level-core';
import type { LevelPlan, SurfaceGraph } from '@roomquest/schema';
import type { RelaxedRule } from '@roomquest/schema';
import { mergeRelaxed } from './relaxed.js';
import type { RepairFn, RepairedBy, SnapFn, ValidateFn } from './types.js';

export interface RecoverPlanOptions {
  validate?: ValidateFn;
  snap?: SnapFn;
  repair?: RepairFn;
}

export interface RecoveredPlan {
  /** Recovered plan when `ok`; otherwise the last real candidate (never a placeholder). */
  plan: LevelPlan;
  ok: boolean;
  repairedBy?: RepairedBy;
  repairs: string[];
  issues: Issue[];
  relaxed: RelaxedRule[];
}

function snapRepairLines(snapped: SnapResult): string[] {
  return snapped.changes.map(
    (change) => `snap ${change.id}: ${change.reason}`
  );
}

function withRelaxed(
  recovered: Omit<RecoveredPlan, 'relaxed'>,
  ...sources: unknown[]
): RecoveredPlan {
  return {
    ...recovered,
    relaxed: mergeRelaxed(...sources),
  };
}

/**
 * Try local snap, then `repairPlan`, against the caller-pinned graph.
 * Does not mutate `plan` or `graph`.
 */
export async function recoverPlan(
  plan: LevelPlan,
  graph: SurfaceGraph,
  options: RecoverPlanOptions = {}
): Promise<RecoveredPlan> {
  const validate = options.validate ?? validatePlan;
  const snap = options.snap ?? snapPlacementsToSlots;
  const repair = options.repair ?? repairPlan;

  const first = await validate(plan, graph);
  if (first.ok) {
    return withRelaxed(
      { plan, ok: true, repairs: [], issues: [] },
      plan,
      first
    );
  }

  const snapped = await snap(plan, graph);
  const afterSnap = await validate(snapped.plan, graph);
  if (afterSnap.ok) {
    return withRelaxed(
      {
        plan: snapped.plan,
        ok: true,
        repairedBy: 'snap',
        repairs: snapRepairLines(snapped),
        issues: first.issues,
      },
      plan,
      first,
      snapped.plan,
      afterSnap
    );
  }

  const repaired = await repair(snapped.plan, graph);
  if (repaired.ok) {
    const afterRepair = repaired.result.ok
      ? repaired.result
      : await validate(repaired.plan, graph);
    if (afterRepair.ok) {
      return withRelaxed(
        {
          plan: repaired.plan,
          ok: true,
          repairedBy: 'repairPlan',
          repairs: repaired.repairs,
          issues: first.issues,
        },
        plan,
        first,
        snapped.plan,
        afterSnap,
        repaired.plan,
        afterRepair
      );
    }
  }

  // repairPlan failed explicitly (no placeholder plan). `plan` is the last
  // real candidate for diagnostics only; callers never serve it when
  // `ok` is false — they take their existing next step.
  return withRelaxed(
    {
      plan: snapped.plan,
      ok: false,
      repairs: repaired.repairs,
      issues: first.issues,
    },
    plan,
    first,
    snapped.plan,
    afterSnap,
    repaired.result
  );
}
