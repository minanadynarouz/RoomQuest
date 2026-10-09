import { resolveLeverGates } from '@roomquest/level-core';
import type { LevelPlan } from '@roomquest/schema';
import type { GameStore } from '../../game/index.js';

/**
 * Shared lever path used by poke, ray+pinch, and `__rq.autoSolve()`.
 * Emits `leverPulled` then `gateOpened` for each newly opened linked gate.
 */
export function pullLever(
  store: GameStore,
  plan: LevelPlan,
  leverId: string
): boolean {
  const lever = plan.placements.find(
    (placement) => placement.id === leverId && placement.piece === 'lever'
  );
  if (!lever) return false;
  if (
    store.events.some(
      (event) => event.type === 'leverPulled' && event.placementId === leverId
    )
  ) {
    return false;
  }
  store.leverPulled(leverId);
  const gates = resolveLeverGates(plan, leverId);
  for (const gateId of gates) {
    const already = store.events.some(
      (event) => event.type === 'gateOpened' && event.placementId === gateId
    );
    if (!already) {
      store.gateOpened(gateId);
    }
  }
  return true;
}
