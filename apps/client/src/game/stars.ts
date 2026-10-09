/**
 * Stars formula - F-02 / F-07
 *
 * Pure function: 0–3 stars from the level plan's targets plus gems
 * collected and elapsed time. No DOM, IWSDK, or Three.js.
 *
 * Plan fields used when present:
 * - `parTimeMs` — time target for the 3-star time condition
 * - `gemTarget` — optional override (not on LevelPlan yet; read if present)
 *
 * Defaults when those fields are missing or unusable:
 * - par time: 180_000 ms (3 minutes), matching a mid-range `parTimeMs`
 * - gem target: count of `gem` placements on the plan; if that count is 0
 *   or placements are absent, 3 (Architecture §7)
 *
 * Scoring (Architecture §7, ResultRequest allows 0..3):
 * - 0: not completed (quit / incomplete)
 * - 3: completed AND time ≤ par AND gems ≥ gem target
 * - 2: completed AND (time ≤ par OR gems ≥ gem target)
 * - 1: completed AND neither
 */

export type StarCount = 0 | 1 | 2 | 3;

/** Mid-range par when the plan has no usable `parTimeMs`. */
export const DEFAULT_PAR_TIME_MS = 180_000;

/** Architecture §7 gem bar when the plan has no gem placements or override. */
export const DEFAULT_GEM_TARGET = 3;

export interface StarPlanInput {
  parTimeMs?: number;
  gemTarget?: number;
  placements?: readonly { piece: string }[];
}

export interface StarTargets {
  parTimeMs: number;
  gemTarget: number;
}

export interface CalculateStarsInput {
  plan?: StarPlanInput | null;
  gemsCollected: number;
  elapsedMs: number;
  /** When omitted, treated as completed (win-screen scoring). */
  completed?: boolean;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function gemPlacementCount(
  placements: readonly { piece: string }[] | undefined
): number {
  if (!placements || placements.length === 0) return 0;
  let count = 0;
  for (const placement of placements) {
    if (placement.piece === 'gem') count += 1;
  }
  return count;
}

/**
 * Resolve par time and gem target from a plan, applying documented defaults.
 */
export function resolveStarTargets(
  plan: StarPlanInput | null | undefined
): StarTargets {
  const parTimeMs =
    isFiniteNumber(plan?.parTimeMs) && plan.parTimeMs > 0
      ? plan.parTimeMs
      : DEFAULT_PAR_TIME_MS;

  if (isFiniteNumber(plan?.gemTarget) && plan.gemTarget >= 0) {
    return { parTimeMs, gemTarget: plan.gemTarget };
  }

  const fromPlacements = gemPlacementCount(plan?.placements);
  return {
    parTimeMs,
    gemTarget: fromPlacements > 0 ? fromPlacements : DEFAULT_GEM_TARGET,
  };
}

/**
 * 0–3 stars from plan targets, gems collected, and elapsed time.
 */
export function calculateStars(input: CalculateStarsInput): StarCount {
  if (input.completed === false) {
    return 0;
  }

  const { parTimeMs, gemTarget } = resolveStarTargets(input.plan);
  const timeOk = input.elapsedMs <= parTimeMs;
  const gemsOk = gemTarget === 0 || input.gemsCollected >= gemTarget;

  if (timeOk && gemsOk) return 3;
  if (timeOk || gemsOk) return 2;
  return 1;
}
