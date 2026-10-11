import {
  repairPlan,
  repairRoute as levelCoreRepairRoute,
  snapPlacementsToSlots,
  validatePlan,
  type RepairResult,
  type ValidationResult,
} from '@roomquest/level-core';
import { LevelPlan, type SurfaceGraph, type Tier } from '@roomquest/schema';

/** Local deterministic stage that turned an invalid plan valid. */
export type LocalRepairStage = 'snap' | 'repair-route' | 'repair-plan';

export interface LocalRepairOutcome extends RepairResult {
  /** First local stage after which `validatePlan` passed; null if none. */
  fixedBy: LocalRepairStage | null;
  /**
   * `repairPlan` replaced unrecoverable input with its built-in stub plan.
   * That stub can validate on some graphs but is not the model's level, so
   * callers must treat it as a local-repair failure.
   */
  usedStub: boolean;
}

/** `repairPlan` repair strings that mean "input discarded, stub returned". */
const STUB_REPAIRS = [
  'replaced non-object plan with a stub',
  'gave up on unrecoverable input',
] as const;

export interface RepairRouteResult {
  plan: LevelPlan;
  repairs: string[];
}

/**
 * Apply `snapPlacementsToSlots` from `@roomquest/level-core` (#64).
 * Returns the snapped plan; unchanged when there are no slot moves.
 */
export function trySnapPlacementsToSlots(
  plan: LevelPlan,
  graph: SurfaceGraph
): LevelPlan {
  return snapPlacementsToSlots(plan, graph).plan;
}

export interface RepairRouteContext {
  /** Daily seed (route-link tie-breaks). Defaults to `plan.seed`. */
  seed?: string;
  tier?: Tier;
}

/**
 * Route-repair hook: level-core `repairRoute` (#68). Single call site used
 * by {@link localRepairPlan}. Only the `kept` strategy (the plan's own route
 * rebuilt) is accepted; the `skeleton` fallback is a fresh procedural path,
 * not the model's plan, so it is treated as "no change" here and repairPlan
 * runs next instead.
 */
export function repairRoute(
  plan: LevelPlan,
  graph: SurfaceGraph,
  ctx: RepairRouteContext = {}
): RepairRouteResult {
  const result = levelCoreRepairRoute(plan, graph, {
    seed: ctx.seed ?? plan.seed,
    tier: ctx.tier,
  });
  if (result.strategy !== 'kept' || !result.changed) {
    return { plan, repairs: [] };
  }
  return { plan: result.plan, repairs: ['repair-route'] };
}

function addRepair(repairs: string[], label: string): void {
  if (!repairs.includes(label)) {
    repairs.push(label);
  }
}

function safeValidate(
  plan: LevelPlan,
  graph: SurfaceGraph
): ValidationResult | undefined {
  try {
    return validatePlan(plan, graph);
  } catch {
    return undefined;
  }
}

/**
 * Local deterministic repair (the caller already validated the draft):
 *
 *   snapPlacementsToSlots → repairRoute → repairPlan → validatePlan
 *
 * `validatePlan` runs after each stage so the caller can log which stage
 * fixed the plan (`fixedBy`). Snap and route only run on a schema-valid
 * LevelPlan; anything else goes straight to `repairPlan`, which coerces
 * malformed input and never throws.
 */
export function localRepairPlan(
  plan: LevelPlan,
  graph: SurfaceGraph,
  ctx: RepairRouteContext = {}
): LocalRepairOutcome {
  const repairs: string[] = [];
  let current = plan;

  if (LevelPlan.safeParse(plan).success) {
    try {
      const snapped = snapPlacementsToSlots(current, graph);
      if (snapped.changes.length > 0) {
        current = snapped.plan;
        addRepair(repairs, 'snap-to-slots');
        const afterSnap = safeValidate(current, graph);
        if (afterSnap?.ok === true) {
          return {
            plan: current,
            repairs,
            result: afterSnap,
            relaxed: afterSnap.relaxed,
            fixedBy: 'snap',
            usedStub: false,
          };
        }
      }
    } catch {
      // Snap is best effort; repairPlan below handles the plan as-is.
    }

    let routed: RepairRouteResult = { plan: current, repairs: [] };
    try {
      routed = repairRoute(current, graph, ctx);
    } catch {
      // Best effort, like snap.
    }
    if (routed.plan !== current || routed.repairs.length > 0) {
      current = routed.plan;
      for (const label of routed.repairs) {
        addRepair(repairs, label);
      }
      const afterRoute = safeValidate(current, graph);
      if (afterRoute?.ok === true) {
        return {
          plan: current,
          repairs,
          result: afterRoute,
          relaxed: afterRoute.relaxed,
          fixedBy: 'repair-route',
          usedStub: false,
        };
      }
    }
  }

  const repaired = repairPlan(current, graph);
  for (const label of repaired.repairs) {
    addRepair(repairs, label);
  }
  const result = safeValidate(repaired.plan, graph) ?? repaired.result;
  const usedStub = repaired.repairs.some((label) =>
    (STUB_REPAIRS as readonly string[]).includes(label)
  );
  return {
    plan: repaired.plan,
    repairs,
    result,
    relaxed: result.relaxed,
    fixedBy: result.ok && !usedStub ? 'repair-plan' : null,
    usedStub,
  };
}
