import type { LevelPlan } from '@roomquest/schema';
import type { GameStore } from '../../game/index.js';
import { pullLever } from '../lever/activate.js';
import type { PlacementDebugApi } from '../systems/PlacementSystem.js';

export interface AutoSolveOptions {
  store: GameStore;
  plan: LevelPlan;
  placement?: PlacementDebugApi | null;
}

/**
 * Pre-build every `playerBuilt` piece and open/stun remaining blockers so
 * the explorer can finish the fixture unattended.
 */
export function autoSolve(options: AutoSolveOptions): void {
  const { store, plan, placement } = options;
  const events = store.events;

  const hasEvent = (
    type: 'pieceBuilt' | 'leverPulled' | 'slimeStunned',
    placementId: string
  ): boolean =>
    events.some(
      (event) => event.type === type && event.placementId === placementId
    );

  for (const placementRow of plan.placements) {
    if (placementRow.playerBuilt && !hasEvent('pieceBuilt', placementRow.id)) {
      const snapped = snapWithPlacement(placement, placementRow.id);
      if (!snapped) {
        store.pieceBuilt(placementRow.id);
      }
    }
    if (
      placementRow.piece === 'lever' &&
      !hasEvent('leverPulled', placementRow.id)
    ) {
      pullLever(store, plan, placementRow.id);
    }
    if (
      placementRow.piece === 'slime' &&
      !hasEvent('slimeStunned', placementRow.id)
    ) {
      store.slimeStunned(placementRow.id);
    }
  }
}

function snapWithPlacement(
  placement: PlacementDebugApi | null | undefined,
  placementId: string
): boolean {
  if (!placement) return false;
  if (!placement.grab(placementId, 'right')) return false;
  if (!placement.moveToTarget(placementId)) {
    placement.release();
    return false;
  }
  return placement.release() === 'snap';
}
