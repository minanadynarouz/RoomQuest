/**
 * Tiny AudioContext unlock for the landing Enter gesture.
 *
 * Keep this module free of SFX URLs and IWSDK so it can sit in the landing
 * chunk without pulling the XR audio manager.
 */

export interface UnlockableContext {
  state: string;
  resume: () => Promise<void>;
}

type AudioCtor = new () => UnlockableContext;

let ctx: UnlockableContext | null = null;
let blocked = false;

function audioCtor(): AudioCtor | null {
  if (typeof window === 'undefined') return null;
  const view = window as unknown as {
    AudioContext?: AudioCtor;
    webkitAudioContext?: AudioCtor;
  };
  return view.AudioContext ?? view.webkitAudioContext ?? null;
}

export function resetAudioUnlock(): void {
  ctx = null;
  blocked = false;
}

export function isAudioBlocked(): boolean {
  return blocked;
}

/**
 * Create (or reuse) the shared AudioContext. Returns null when the
 * constructor is missing or throws — callers must fail silently.
 */
export function getAudioContext(): UnlockableContext | null {
  if (blocked) return null;
  if (ctx) return ctx;
  const Ctor = audioCtor();
  if (!Ctor) {
    blocked = true;
    return null;
  }
  try {
    ctx = new Ctor();
    return ctx;
  } catch {
    blocked = true;
    ctx = null;
    return null;
  }
}

/**
 * Resume the AudioContext inside a user-gesture handler (landing Enter).
 * Never throws. Returns false when audio is unavailable or blocked.
 */
export function unlockAudio(): boolean {
  try {
    const audio = getAudioContext();
    if (!audio) return false;
    if (audio.state === 'suspended') {
      void audio.resume().catch(() => {
        blocked = true;
      });
    }
    return !blocked;
  } catch {
    blocked = true;
    return false;
  }
}
