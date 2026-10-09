import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_MASTER_VOLUME,
  getMasterVolume,
  playSound,
  resetAudioEngine,
  setMasterVolume,
} from './engine.js';
import { SOUND_MANIFEST } from './manifest.js';
import { resetAudioUnlock, unlockAudio } from './unlock.js';

interface MockPanner {
  panningModel: string;
  distanceModel: string;
  refDistance: number;
  rolloffFactor: number;
  setPosition: ReturnType<typeof vi.fn>;
  connect: (node: unknown) => unknown;
}

function param() {
  const rec = {
    value: 1,
    setValueAtTime: vi.fn((value: number) => {
      rec.value = value;
    }),
    exponentialRampToValueAtTime: vi.fn(),
  };
  return rec;
}

function installMockAudio(): {
  panners: MockPanner[];
  gains: { gain: { value: number } }[];
} {
  const panners: MockPanner[] = [];
  const gains: { gain: { value: number } }[] = [];

  class MockAudioContext {
    state = 'suspended';
    currentTime = 0;
    sampleRate = 22050;
    destination = { kind: 'destination' };
    resume = vi.fn(() => {
      this.state = 'running';
      return Promise.resolve();
    });
    decodeAudioData = vi.fn((data: ArrayBuffer) => Promise.resolve(data));
    createGain() {
      const node = { gain: param(), connect: vi.fn() };
      gains.push(node);
      return node;
    }
    createBufferSource() {
      return {
        buffer: null,
        connect: vi.fn(),
        start: vi.fn(),
        stop: vi.fn(),
      };
    }
    createOscillator() {
      return {
        type: 'sine',
        frequency: param(),
        connect: vi.fn(),
        start: vi.fn(),
        stop: vi.fn(),
      };
    }
    createBiquadFilter() {
      return {
        type: 'lowpass',
        frequency: param(),
        Q: param(),
        connect: vi.fn(),
      };
    }
    createBuffer(_c: number, length: number) {
      return { getChannelData: () => new Float32Array(length) };
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

  Object.defineProperty(window, 'AudioContext', {
    configurable: true,
    writable: true,
    value: MockAudioContext,
  });
  Object.defineProperty(window, 'webkitAudioContext', {
    configurable: true,
    writable: true,
    value: undefined,
  });
  return { panners, gains };
}

describe('audio engine', () => {
  const originalAudio = window.AudioContext;
  const originalWebkit = (
    window as typeof window & { webkitAudioContext?: unknown }
  ).webkitAudioContext;

  afterEach(() => {
    resetAudioEngine();
    resetAudioUnlock();
    Object.defineProperty(window, 'AudioContext', {
      configurable: true,
      writable: true,
      value: originalAudio,
    });
    Object.defineProperty(window, 'webkitAudioContext', {
      configurable: true,
      writable: true,
      value: originalWebkit,
    });
  });

  beforeEach(() => {
    resetAudioEngine();
    resetAudioUnlock();
  });

  it('applies master volume to the gain node', () => {
    const { gains } = installMockAudio();
    unlockAudio();
    setMasterVolume(0.4);
    playSound('pieceBuilt');
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

  it('plays spatial chirps through a PannerNode', () => {
    const { panners } = installMockAudio();
    unlockAudio();
    playSound('explorerOutOfView', { x: 1.5, y: 0.8, z: -2 });
    expect(panners).toHaveLength(1);
    expect(panners[0]?.setPosition).toHaveBeenCalledWith(1.5, 0.8, -2);
    expect(panners[0]?.panningModel).toBe('HRTF');
  });

  it('applies the manifest per-clip gain', () => {
    const { gains } = installMockAudio();
    unlockAudio();
    playSound('pieceBuilt');
    const clipGains = gains.map((g) => g.gain.value);
    expect(clipGains).toContain(SOUND_MANIFEST.pieceBuilt.gain);
  });

  it('ignores a position when the manifest says the clip is not spatial', () => {
    const { panners } = installMockAudio();
    unlockAudio();
    playSound('pieceBuilt', { x: 9, y: 9, z: 9 });
    expect(panners).toHaveLength(0);
  });

  it('does not throw when audio is unavailable', () => {
    Object.defineProperty(window, 'AudioContext', {
      configurable: true,
      writable: true,
      value: undefined,
    });
    Object.defineProperty(window, 'webkitAudioContext', {
      configurable: true,
      writable: true,
      value: undefined,
    });
    expect(() => playSound('won')).not.toThrow();
  });
});
