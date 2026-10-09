import type { GameStore } from '../../game/index.js';

type SlimeEventLike = {
  type: string;
  placementId?: string;
};

/**
 * Latest slime event for `placementId` wins: true only when that event is
 * `slimeStunned` (a later `slimeWoke` means the historical stun is spent).
 * Used so `SlimeSystem.rebind()` does not restun from the event log.
 */
export function isSlimeStunStillActive(
  events: readonly SlimeEventLike[],
  placementId: string
): boolean {
  for (let i = events.length - 1; i >= 0; i -= 1) {
    const event = events[i];
    if (!event || event.placementId !== placementId) continue;
    if (event.type === 'slimeStunned') return true;
    if (event.type === 'slimeWoke') return false;
  }
  return false;
}

/**
 * Shared slime stun path used by poke, ray+pinch, and `__rq.autoSolve()`.
 * Emits `slimeStunned` once per awake→stunned transition.
 */
export function emitSlimeStunned(
  store: GameStore,
  placementId: string
): boolean {
  if (isSlimeStunStillActive(store.events, placementId)) return false;
  store.slimeStunned(placementId);
  return true;
}
