/**
 * Typed helper for 3D systems watching the director `/levels` flight.
 * No minimum visible duration — the room-reading side decides that.
 */

import type { GameStore } from './store.js';
import type { DirectorRequestState } from './types.js';

export function onDirectorRequest(
  store: GameStore,
  cb: (state: DirectorRequestState) => void
): () => void {
  return store.onDirectorRequest(cb);
}
