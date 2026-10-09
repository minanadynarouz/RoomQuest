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
export { SOUND_FOR_EVENT, SOUND_IDS, type SoundId } from './mapping.js';
export { SOUND_URLS } from './catalog.js';
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
