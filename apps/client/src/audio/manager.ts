/**
 * F-08 audio manager. Subscribes to the F-02 store public API and plays
 * placeholder SFX from the sound manifest. Spatial clips use F-06
 * ExplorerTarget.
 */

import type { GameEvent, GameStore } from '../game/index.js';
import { getExplorerTarget } from '../ui/explorer-target.js';
import { SOUND_MANIFEST, type SoundKey } from './manifest.js';
import {
  playSound,
  preloadSounds,
  setMasterVolume as setEngineVolume,
  getMasterVolume as getEngineVolume,
  type AudioPosition,
} from './engine.js';
import { unlockAudio } from './unlock.js';

export const CHIRP_COOLDOWN_MS = 4000;

let unsubscribe: (() => void) | null = null;
let lastSpatialAt = Number.NEGATIVE_INFINITY;
const tmpPos: AudioPosition = { x: 0, y: 0, z: 0 };
let nowMs = (): number =>
  typeof performance !== 'undefined' ? performance.now() : Date.now();

export function resetAudioManager(): void {
  unsubscribe?.();
  unsubscribe = null;
  lastSpatialAt = Number.NEGATIVE_INFINITY;
}

export function setAudioClock(clock: () => number): void {
  nowMs = clock;
}

function playEntry(key: SoundKey): void {
  const entry = SOUND_MANIFEST[key];
  if (entry.spatial) {
    const target = getExplorerTarget();
    if (target) {
      target.getWorldPosition(tmpPos);
      playSound(key, { x: tmpPos.x, y: tmpPos.y, z: tmpPos.z });
      return;
    }
  }
  playSound(key);
}

export function handleGameEvent(event: GameEvent, atMs = nowMs()): void {
  const entry = SOUND_MANIFEST[event.type];
  if (entry.spatial) {
    if (atMs - lastSpatialAt < CHIRP_COOLDOWN_MS) return;
    lastSpatialAt = atMs;
  }
  playEntry(event.type);
}

export function bindAudioStore(store: GameStore): void {
  unsubscribe?.();
  unsubscribe = store.subscribeEvents((event) => {
    handleGameEvent(event);
  });
}

export function playUiSound(key: SoundKey): void {
  playEntry(key);
}

/** Replaces F-06's placeholder oscillator blip. */
export function playExplorerChirp(): void {
  handleGameEvent(
    { type: 'explorerOutOfView', timestamp: nowMs(), beatIndex: 0 },
    nowMs()
  );
}

export function setMasterVolume(volume: number): void {
  setEngineVolume(volume);
}

export function getMasterVolume(): number {
  return getEngineVolume();
}

export { preloadSounds, unlockAudio };
