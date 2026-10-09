import type { LevelPlan, Placement } from '@roomquest/schema';

/** Mutable lever/gate flags used by the XR system and tests. */
export interface LeverGateState {
  pulledLevers: Set<string>;
  openGates: Set<string>;
}

export function emptyLeverGateState(): LeverGateState {
  return { pulledLevers: new Set(), openGates: new Set() };
}

function isLever(placement: Placement | undefined): placement is Placement {
  return placement?.piece === 'lever';
}

function gateIdsOf(plan: LevelPlan): Set<string> {
  const ids = new Set<string>();
  for (const placement of plan.placements) {
    if (placement.piece === 'gate') {
      ids.add(placement.id);
    }
  }
  return ids;
}

/**
 * Honour LevelPlan `links`: a lever opens the gates it names.
 * Unknown ids and non-gate targets are dropped (validator already flags them).
 */
export function resolveLeverGates(plan: LevelPlan, leverId: string): string[] {
  const lever = plan.placements.find((placement) => placement.id === leverId);
  if (!isLever(lever)) {
    return [];
  }
  const gates = gateIdsOf(plan);
  const resolved: string[] = [];
  for (const link of lever.links) {
    if (gates.has(link) && !resolved.includes(link)) {
      resolved.push(link);
    }
  }
  return resolved;
}

/** leverId → gate ids, in plan placement order. */
export function resolveAllLeverLinks(plan: LevelPlan): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const placement of plan.placements) {
    if (placement.piece === 'lever') {
      map.set(placement.id, resolveLeverGates(plan, placement.id));
    }
  }
  return map;
}

export interface LeverPullResult {
  /** True when this call newly marked the lever pulled. */
  pulled: boolean;
  openedGates: string[];
}

/**
 * Pull a lever once. Linked closed gates open. Repeat pulls are no-ops.
 */
export function applyLeverPull(
  state: LeverGateState,
  plan: LevelPlan,
  leverId: string
): LeverPullResult {
  const lever = plan.placements.find((placement) => placement.id === leverId);
  if (!isLever(lever) || state.pulledLevers.has(leverId)) {
    return { pulled: false, openedGates: [] };
  }
  state.pulledLevers.add(leverId);
  const openedGates: string[] = [];
  for (const gateId of resolveLeverGates(plan, leverId)) {
    if (!state.openGates.has(gateId)) {
      state.openGates.add(gateId);
      openedGates.push(gateId);
    }
  }
  return { pulled: true, openedGates };
}

/** Greybox boom duration. Injected delta time drives this — no wall clock. */
export const GATE_OPEN_DURATION_S = 0.4;
export const GATE_OPEN_ANGLE_RAD = 1.15;
export const LEVER_PULL_DURATION_S = 0.22;
export const LEVER_PULL_ANGLE_RAD = 0.85;

/** Ease-out cubic in 0..1 from elapsed seconds. */
export function gateOpenProgress(
  elapsedS: number,
  durationS = GATE_OPEN_DURATION_S
): number {
  if (elapsedS <= 0) {
    return 0;
  }
  if (elapsedS >= durationS) {
    return 1;
  }
  const x = elapsedS / durationS;
  const inv = 1 - x;
  return 1 - inv * inv * inv;
}

export function gateLeafRotationX(
  progress: number,
  openAngle = GATE_OPEN_ANGLE_RAD
): number {
  return openAngle * progress;
}

export function leverHandleRotationX(
  progress: number,
  pullAngle = LEVER_PULL_ANGLE_RAD
): number {
  return pullAngle * progress;
}
