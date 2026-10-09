/**
 * F-08 audio manager. Subscribes to the F-02 store public API and plays
 * CC0 SFX. Explorer chirps are spatial at F-06 ExplorerTarget.
 */

import type { GameEvent, GameStore } from '../game/index.js';
import { getExplorerTarget } from '../ui/explorer-target.js';
import { SOUND_FOR_EVENT, type SoundId, type UiSoundId } from './mapping.js';
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
let lastChirpAt = Number.NEGATIVE_INFINITY;
const tmpPos: AudioPosition = { x: 0, y: 0, z: 0 };
let nowMs = (): number =>
  typeof performance !== 'undefined' ? performance.now() : Date.now();

export function resetAudioManager(): void {
  unsubscribe?.();
  unsubscribe = null;
  lastChirpAt = Number.NEGATIVE_INFINITY;
}

export function setAudioClock(clock: () => number): void {
  nowMs = clock;
}

function playChirp(): void {
  const target = getExplorerTarget();
  if (target) {
    target.getWorldPosition(tmpPos);
    playSound('chirp', { x: tmpPos.x, y: tmpPos.y, z: tmpPos.z });
    return;
  }
  playSound('chirp');
}

export function handleGameEvent(event: GameEvent, atMs = nowMs()): void {
  const sound: SoundId = SOUND_FOR_EVENT[event.type];
  if (sound === 'chirp') {
    if (atMs - lastChirpAt < CHIRP_COOLDOWN_MS) return;
    lastChirpAt = atMs;
    playChirp();
    return;
  }
  playSound(sound);
}

export function bindAudioStore(store: GameStore): void {
  unsubscribe?.();
  unsubscribe = store.subscribeEvents((event) => {
    handleGameEvent(event);
  });
}

export function playUiSound(id: UiSoundId): void {
  playSound(id);
}

/** Replaces F-06's placeholder oscillator blip. */
export function playExplorerChirp(): void {
  const at = nowMs();
  if (at - lastChirpAt < CHIRP_COOLDOWN_MS) return;
  lastChirpAt = at;
  playChirp();
}

export function setMasterVolume(volume: number): void {
  setEngineVolume(volume);
}

export function getMasterVolume(): number {
  return getEngineVolume();
}

export { preloadSounds, unlockAudio };
