import {
  repairPlan,
  repairRoute as levelCoreRepairRoute,
  snapPlacementsToSlots,
  validatePlan,
  type ValidationResult,
} from '@roomquest/level-core';
import {
  LevelPlan,
  type RelaxedRule,
  type SurfaceGraph,
  type Tier,
} from '@roomquest/schema';

/** Local deterministic stage that turned an invalid plan valid. */
export type LocalRepairStage = 'snap' | 'repair-route' | 'repair-plan';

interface LocalRepairBase {
  repairs: string[];
  result: ValidationResult;
  relaxed: RelaxedRule[];
}

/**
 * Local repair outcome. Failure is explicit and plan-less (level-core
 * `repairPlan` no longer returns a placeholder), so the caller goes to
 * its LLM-repair / procedural fallback.
 */
export type LocalRepairOutcome =
  | (LocalRepairBase & {
      ok: true;
      plan: LevelPlan;
      /** First local stage after which `validatePlan` passed. */
      fixedBy: LocalRepairStage;
    })
  | (LocalRepairBase & {
      ok: false;
      plan?: never;
      fixedBy: null;
      /**
       * repairPlan could not even coerce the input into a plan, so its
       * issues describe the input shape, not the model's level.
       */
      unrecoverable: boolean;
      /**
       * level-core `repairRoute` returned its `skeleton` strategy: a
       * brand-new procedural plan, not a repair of the model's plan. The
       * director must fall back to procedural (`llm-invalid`, failedAt
       * `repairRoute`) instead of serving or further repairing it.
       */
      routeSkeleton: boolean;
    });

/** repairPlan repair strings meaning "input could not be coerced". */
const UNRECOVERABLE_REPAIRS = [
  'rejected non-object plan',
  'gave up on unrecoverable input',
] as const;

export interface RepairRouteResult {
  plan: LevelPlan;
  repairs: string[];
  /** True when level-core answered with a fresh `skeleton` plan (rejected). */
  skeleton: boolean;
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
 * rebuilt) is accepted. The `skeleton` fallback is a fresh procedural path,
 * not the model's plan: it is never returned as the plan, and `skeleton`
 * is flagged so the director falls back to procedural instead of serving
 * it (or anything derived from it) as an LLM repair.
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
  if (result.strategy === 'skeleton') {
    return { plan, repairs: [], skeleton: true };
  }
  if (result.strategy !== 'kept' || !result.changed) {
    return { plan, repairs: [], skeleton: false };
  }
  return { plan: result.plan, repairs: ['repair-route'], skeleton: false };
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
            ok: true,
            plan: current,
            repairs,
            result: afterSnap,
            relaxed: afterSnap.relaxed,
            fixedBy: 'snap',
          };
        }
      }
    } catch {
      // Snap is best effort; repairPlan below handles the plan as-is.
    }

    let routed: RepairRouteResult = {
      plan: current,
      repairs: [],
      skeleton: false,
    };
    try {
      routed = repairRoute(current, graph, ctx);
    } catch {
      // Best effort, like snap.
    }
    if (routed.skeleton) {
      // repairRoute could not keep the model's route and produced a fresh
      // procedural skeleton. That is not a repair: report failure.
      const unrepaired =
        safeValidate(current, graph) ?? validatePlan(plan, graph);
      return {
        ok: false,
        repairs,
        result: unrepaired,
        relaxed: unrepaired.relaxed,
        fixedBy: null,
        unrecoverable: false,
        routeSkeleton: true,
      };
    }
    if (routed.plan !== current || routed.repairs.length > 0) {
      current = routed.plan;
      for (const label of routed.repairs) {
        addRepair(repairs, label);
      }
      const afterRoute = safeValidate(current, graph);
      if (afterRoute?.ok === true) {
        return {
          ok: true,
          plan: current,
          repairs,
          result: afterRoute,
          relaxed: afterRoute.relaxed,
          fixedBy: 'repair-route',
        };
      }
    }
  }

  const repaired = repairPlan(current, graph);
  for (const label of repaired.repairs) {
    addRepair(repairs, label);
  }
  if (!repaired.ok) {
    return {
      ok: false,
      repairs,
      result: repaired.result,
      relaxed: repaired.relaxed,
      fixedBy: null,
      unrecoverable: repaired.repairs.some((label) =>
        (UNRECOVERABLE_REPAIRS as readonly string[]).includes(label)
      ),
      routeSkeleton: false,
    };
  }
  const result = safeValidate(repaired.plan, graph) ?? repaired.result;
  if (!result.ok) {
    return {
      ok: false,
      repairs,
      result,
      relaxed: result.relaxed,
      fixedBy: null,
      unrecoverable: false,
      routeSkeleton: false,
    };
  }
  return {
    ok: true,
    plan: repaired.plan,
    repairs,
    result,
    relaxed: result.relaxed,
    fixedBy: 'repair-plan',
  };
}
