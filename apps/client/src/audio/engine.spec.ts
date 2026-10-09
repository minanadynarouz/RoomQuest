import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_MASTER_VOLUME,
  getMasterVolume,
  playSound,
  putAudioBuffer,
  resetAudioEngine,
  setMasterVolume,
} from './engine.js';
import { resetAudioUnlock, unlockAudio } from './unlock.js';

interface Started {
  buffer: unknown;
  destination: 'gain' | 'panner';
}

interface MockPanner {
  panningModel: string;
  distanceModel: string;
  refDistance: number;
  rolloffFactor: number;
  setPosition: ReturnType<typeof vi.fn>;
  connect: (node: unknown) => unknown;
}

function installMockAudio(): {
  starts: Started[];
  panners: MockPanner[];
  gains: { gain: { value: number } }[];
} {
  const starts: Started[] = [];
  const panners: MockPanner[] = [];
  const gains: { gain: { value: number } }[] = [];

  class MockAudioContext {
    state = 'suspended';
    currentTime = 0;
    destination = { kind: 'destination' };
    resume = vi.fn(() => {
      this.state = 'running';
      return Promise.resolve();
    });
    decodeAudioData = vi.fn((data: ArrayBuffer) => Promise.resolve(data));
    createGain() {
      const node = {
        gain: { value: 1 },
        connect: vi.fn(),
      };
      gains.push(node);
      return node;
    }
    createBufferSource() {
      const source = {
        buffer: null as unknown,
        viaPanner: false,
        connect: (node: { setPosition?: unknown }) => {
          source.viaPanner = typeof node.setPosition === 'function';
          return node;
        },
        start: vi.fn(() => {
          starts.push({
            buffer: source.buffer,
            destination: source.viaPanner ? 'panner' : 'gain',
          });
        }),
      };
      return source;
    }
    createPanner() {
      const panner: MockPanner = {
        panningModel: 'equalpower',
        distanceModel: 'linear',
        refDistance: 0,
        rolloffFactor: 0,
        setPosition: vi.fn(),
        connect: vi.fn(),
      };
      panners.push(panner);
      return panner;
    }
  }

  (
    window as unknown as { AudioContext: typeof MockAudioContext }
  ).AudioContext = MockAudioContext;
  return { starts, panners, gains };
}

describe('audio engine', () => {
  afterEach(() => {
    resetAudioEngine();
    resetAudioUnlock();
  });

  beforeEach(() => {
    resetAudioEngine();
    resetAudioUnlock();
  });

  it('applies master volume to the gain node', () => {
    const { gains } = installMockAudio();
    unlockAudio();
    putAudioBuffer('snap', { id: 'snap-buf' });
    setMasterVolume(0.4);
    playSound('snap');
    expect(getMasterVolume()).toBe(0.4);
    expect(gains[0]?.gain.value).toBe(0.4);
  });

  it('defaults master volume and clamps it', () => {
    installMockAudio();
    expect(getMasterVolume()).toBe(DEFAULT_MASTER_VOLUME);
    setMasterVolume(2);
    expect(getMasterVolume()).toBe(1);
    setMasterVolume(-1);
    expect(getMasterVolume()).toBe(0);
  });

  it('plays through a PannerNode when a position is given', () => {
    const { panners, starts } = installMockAudio();
    unlockAudio();
    putAudioBuffer('chirp', { id: 'chirp-buf' });
    playSound('chirp', { x: 1.5, y: 0.8, z: -2 });
    expect(panners).toHaveLength(1);
    expect(panners[0]?.setPosition).toHaveBeenCalledWith(1.5, 0.8, -2);
    expect(panners[0]?.panningModel).toBe('HRTF');
    expect(starts.some((s) => s.destination === 'panner')).toBe(true);
  });

  it('does not throw when audio is unavailable', () => {
    delete (window as unknown as { AudioContext?: unknown }).AudioContext;
    delete (window as unknown as { webkitAudioContext?: unknown })
      .webkitAudioContext;
    expect(() => playSound('win')).not.toThrow();
  });
});
