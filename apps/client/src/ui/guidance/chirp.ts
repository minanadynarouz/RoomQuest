/**
 * Tiny WebAudio blip when the explorer leaves view (F-06).
 * F-08 replaces this with the real spatial SFX.
 */

interface ChirpAudio {
  state: string;
  currentTime: number;
  resume: () => Promise<void>;
  createOscillator: () => ChirpOscillator;
  createGain: () => ChirpGain;
  destination: unknown;
}

interface ChirpOscillator {
  type: string;
  frequency: {
    setValueAtTime: (value: number, time: number) => void;
    exponentialRampToValueAtTime: (value: number, time: number) => void;
  };
  connect: (node: unknown) => void;
  start: (time?: number) => void;
  stop: (time?: number) => void;
}

interface ChirpGain {
  gain: {
    setValueAtTime: (value: number, time: number) => void;
    exponentialRampToValueAtTime: (value: number, time: number) => void;
  };
  connect: (node: unknown) => void;
}

type AudioCtor = new () => ChirpAudio;

let ctx: ChirpAudio | null = null;

function audioContext(): ChirpAudio | null {
  if (typeof window === 'undefined') return null;
  const Ctor = (
    window as unknown as {
      AudioContext?: AudioCtor;
      webkitAudioContext?: AudioCtor;
    }
  ).AudioContext ?? (
    window as unknown as { webkitAudioContext?: AudioCtor }
  ).webkitAudioContext;
  if (!Ctor) return null;
  if (!ctx) ctx = new Ctor();
  return ctx;
}

export function playExplorerChirp(): void {
  const audio = audioContext();
  if (!audio) return;
  if (audio.state === 'suspended') {
    void audio.resume();
  }
  const osc = audio.createOscillator();
  const gain = audio.createGain();
  const t = audio.currentTime;
  osc.type = 'sine';
  osc.frequency.setValueAtTime(880, t);
  osc.frequency.exponentialRampToValueAtTime(1320, t + 0.08);
  gain.gain.setValueAtTime(0.07, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
  osc.connect(gain);
  gain.connect(audio.destination);
  osc.start(t);
  osc.stop(t + 0.12);
}

export function resetChirpContext(): void {
  ctx = null;
}
