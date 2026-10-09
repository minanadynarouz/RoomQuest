/**
 * WebAudio playback: master gain, buffer cache, PannerNode for spatial SFX.
 *
 * IWSDK 1.0.0-rc.2 ships AudioSource + AudioSystem (Three PositionalAudio on
 * the player head), but AudioUtils.createOneShot does not attach a transform
 * so positioned one-shots cannot use it. This engine is the F-08 player:
 * unlock on Enter, silent failure, PannerNode at ExplorerTarget.
 */

import { SOUND_URLS } from './catalog.js';
import type { SoundId } from './mapping.js';
import {
  getAudioContext,
  isAudioBlocked,
  unlockAudio,
  type UnlockableContext,
} from './unlock.js';

export interface AudioPosition {
  x: number;
  y: number;
  z: number;
}

interface GainLike {
  gain: { value: number };
  connect: (node: unknown) => unknown;
}

interface BufferSourceLike {
  buffer: unknown;
  connect: (node: unknown) => unknown;
  start: (when?: number) => void;
}

interface PannerLike {
  panningModel: string;
  distanceModel: string;
  refDistance: number;
  rolloffFactor: number;
  setPosition?: (x: number, y: number, z: number) => void;
  positionX?: { value: number };
  positionY?: { value: number };
  positionZ?: { value: number };
  connect: (node: unknown) => unknown;
}

export interface PlaybackContext extends UnlockableContext {
  currentTime: number;
  destination: unknown;
  decodeAudioData: (data: ArrayBuffer) => Promise<unknown>;
  createGain: () => GainLike;
  createBufferSource: () => BufferSourceLike;
  createPanner: () => PannerLike;
}

export const DEFAULT_MASTER_VOLUME = 0.85;

let masterVolume = DEFAULT_MASTER_VOLUME;
let masterGain: GainLike | null = null;
const buffers = new Map<SoundId, unknown>();
const loading = new Map<SoundId, Promise<unknown>>();
let fetchImpl: typeof fetch | null = null;

export function resetAudioEngine(): void {
  masterVolume = DEFAULT_MASTER_VOLUME;
  masterGain = null;
  buffers.clear();
  loading.clear();
  fetchImpl = null;
}

export function setAudioFetch(fn: typeof fetch | null): void {
  fetchImpl = fn;
}

export function setMasterVolume(volume: number): void {
  const clamped = Math.min(1, Math.max(0, volume));
  masterVolume = clamped;
  if (masterGain) {
    masterGain.gain.value = clamped;
  }
}

export function getMasterVolume(): number {
  return masterVolume;
}

function asPlayback(ctx: UnlockableContext | null): PlaybackContext | null {
  if (!ctx) return null;
  const candidate = ctx as PlaybackContext;
  if (typeof candidate.createGain !== 'function') return null;
  if (typeof candidate.createBufferSource !== 'function') return null;
  return candidate;
}

function masterNode(audio: PlaybackContext): GainLike | null {
  if (masterGain) return masterGain;
  try {
    const gain = audio.createGain();
    gain.gain.value = masterVolume;
    gain.connect(audio.destination);
    masterGain = gain;
    return gain;
  } catch {
    return null;
  }
}

function placePanner(panner: PannerLike, position: AudioPosition): void {
  panner.panningModel = 'HRTF';
  panner.distanceModel = 'inverse';
  panner.refDistance = 1;
  panner.rolloffFactor = 1;
  if (typeof panner.setPosition === 'function') {
    panner.setPosition(position.x, position.y, position.z);
    return;
  }
  if (panner.positionX) panner.positionX.value = position.x;
  if (panner.positionY) panner.positionY.value = position.y;
  if (panner.positionZ) panner.positionZ.value = position.z;
}

function startSource(
  audio: PlaybackContext,
  buffer: unknown,
  position?: AudioPosition
): void {
  const gain = masterNode(audio);
  if (!gain) return;
  const source = audio.createBufferSource();
  source.buffer = buffer;
  if (position) {
    const panner = audio.createPanner();
    placePanner(panner, position);
    source.connect(panner);
    panner.connect(gain);
  } else {
    source.connect(gain);
  }
  source.start(audio.currentTime);
}

async function decodeSound(id: SoundId): Promise<unknown> {
  const cached = buffers.get(id);
  if (cached) return cached;
  const inflight = loading.get(id);
  if (inflight) return inflight;
  const work = (async () => {
    try {
      const loader = fetchImpl ?? fetch;
      const response = await loader(SOUND_URLS[id]);
      if (!response.ok) return null;
      const bytes = await response.arrayBuffer();
      const audio = asPlayback(getAudioContext());
      if (!audio) return null;
      const buffer = await audio.decodeAudioData(bytes);
      buffers.set(id, buffer);
      return buffer;
    } catch {
      return null;
    } finally {
      loading.delete(id);
    }
  })();
  loading.set(id, work);
  return work;
}

export function putAudioBuffer(id: SoundId, buffer: unknown): void {
  buffers.set(id, buffer);
}

export function playSound(id: SoundId, position?: AudioPosition): void {
  try {
    if (isAudioBlocked()) return;
    unlockAudio();
    const audio = asPlayback(getAudioContext());
    if (!audio) return;
    const buffer = buffers.get(id);
    if (!buffer) {
      void decodeSound(id).then((decoded) => {
        if (!decoded) return;
        try {
          const later = asPlayback(getAudioContext());
          if (!later || isAudioBlocked()) return;
          startSource(later, decoded, position);
        } catch {
          // Audio is best-effort.
        }
      });
      return;
    }
    startSource(audio, buffer, position);
  } catch {
    // Audio is best-effort.
  }
}

export async function preloadSounds(): Promise<void> {
  try {
    if (isAudioBlocked()) return;
    getAudioContext();
    const ids = Object.keys(SOUND_URLS) as SoundId[];
    await Promise.all(ids.map((id) => decodeSound(id)));
  } catch {
    // Preload failure must not block play.
  }
}
