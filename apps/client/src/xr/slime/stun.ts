import type { GameStore } from '../../game/index.js';

/**
 * Shared slime stun path used by poke, ray+pinch, and `__rq.autoSolve()`.
 * Emits `slimeStunned` once per awake→stunned transition.
 */
export function emitSlimeStunned(
  store: GameStore,
  placementId: string
): boolean {
  const already = store.events.some(
    (event) =>
      event.type === 'slimeStunned' &&
      event.placementId === placementId &&
      !wokeAfter(store, event.timestamp, placementId)
  );
  if (already) return false;
  store.slimeStunned(placementId);
  return true;
}

function wokeAfter(
  store: GameStore,
  stunnedAt: number,
  placementId: string
): boolean {
  return store.events.some(
    (event) =>
      event.type === 'slimeWoke' &&
      event.placementId === placementId &&
      event.timestamp > stunnedAt
  );
}
