import type { LevelPlan } from '@roomquest/schema';
import type { GameStore } from '../../game/index.js';
import { pullLever } from '../lever/activate.js';
import type { PlacementDebugApi } from '../systems/PlacementSystem.js';
import type { PlatformDebugApi } from '../systems/PlatformRailSystem.js';
import type { SlimeDebugApi } from '../systems/SlimeSystem.js';
import { emitSlimeStunned } from '../slime/stun.js';

export interface AutoSolveOptions {
  store: GameStore;
  plan: LevelPlan;
  placement?: PlacementDebugApi | null;
  platform?: PlatformDebugApi | null;
  slime?: SlimeDebugApi | null;
}

/**
 * Pre-build every `playerBuilt` piece and open/stun remaining blockers so
 * the explorer can finish the fixture unattended.
 */
export function autoSolve(options: AutoSolveOptions): void {
  const { store, plan, placement, platform, slime } = options;
  const events = store.events;

  const hasEvent = (
    type: 'pieceBuilt' | 'leverPulled' | 'slimeStunned' | 'platformAligned',
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
    if (placementRow.piece === 'slime') {
      if (slime) {
        slime.stun(placementRow.id);
      } else if (!hasEvent('slimeStunned', placementRow.id)) {
        emitSlimeStunned(store, placementRow.id);
      }
    }
    if (
      placementRow.piece === 'moving_platform' &&
      !hasEvent('platformAligned', placementRow.id)
    ) {
      const aligned = platform?.align(placementRow.id) ?? false;
      if (!aligned) {
        store.pieceMoved(placementRow.id, true);
        store.platformAligned(placementRow.id);
      }
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
