import { resetAudioEngine } from './engine.js';
import { resetAudioManager } from './manager.js';
import { resetAudioUnlock } from './unlock.js';

export { unlockAudio, getAudioContext, isAudioBlocked } from './unlock.js';
export { resetAudioUnlock } from './unlock.js';
export {
  bindAudioStore,
  handleGameEvent,
  playUiSound,
  playExplorerChirp,
  preloadSounds,
  setMasterVolume,
  getMasterVolume,
  resetAudioManager,
  CHIRP_COOLDOWN_MS,
  setAudioClock,
} from './manager.js';
export {
  SOUND_MANIFEST,
  SOUND_KEYS,
  soundPublicUrl,
  type SoundKey,
  type SoundEntry,
} from './manifest.js';
export {
  playSound,
  putAudioBuffer,
  setAudioFetch,
  resetAudioEngine,
  DEFAULT_MASTER_VOLUME,
} from './engine.js';

export function resetAudio(): void {
  resetAudioManager();
  resetAudioEngine();
  resetAudioUnlock();
}
