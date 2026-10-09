import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SYNTHETIC_LIVING_ROOM_PLAN } from '@roomquest/fixtures';
import { createGameStore } from '../game/store.js';
import type { LevelPlan } from '@roomquest/schema';
import { pullLever } from '../xr/lever/activate.js';
import {
  resetExplorerTarget,
  setExplorerTarget,
} from '../ui/explorer-target.js';
import { SOUND_MANIFEST } from './manifest.js';
import {
  bindAudioStore,
  handleGameEvent,
  playUiSound,
  resetAudioManager,
  setAudioClock,
} from './manager.js';
import { resetAudioEngine } from './engine.js';
import { resetAudioUnlock, unlockAudio } from './unlock.js';

interface MockPanner {
  setPosition: ReturnType<typeof vi.fn>;
}

function mockPlan(): LevelPlan {
  return {
    seed: 'sfx',
    theme: 'forest',
    title: 'Audio',
    start: 's1',
    goal: 's2',
    placements: [],
    beats: [
      { goal: 'Go', uses: [] },
      { goal: 'Finish', uses: [] },
    ],
    dialogue: [],
    parTimeMs: 60000,
  };
}

function playingStore() {
  const store = createGameStore({ clock: { now: () => 1000 } });
  store.requestLevel();
  store.startSurveying();
  store.startBuilding(mockPlan());
  store.startPlaying();
  return store;
}

function param() {
  return {
    value: 1,
    setValueAtTime: vi.fn(),
    exponentialRampToValueAtTime: vi.fn(),
  };
}

function installMockAudio(): { voices: number; panners: MockPanner[] } {
  const panners: MockPanner[] = [];
  const rec = { voices: 0 };
  class MockAudioContext {
    state = 'running';
    currentTime = 0;
    sampleRate = 22050;
    destination = {};
    resume = vi.fn(() => Promise.resolve());
    decodeAudioData = vi.fn((data: ArrayBuffer) => Promise.resolve(data));
    createGain() {
      return { gain: param(), connect: vi.fn() };
    }
    createBufferSource() {
      return {
        buffer: null,
        connect: vi.fn(),
        start: vi.fn(() => {
          rec.voices += 1;
        }),
        stop: vi.fn(),
      };
    }
    createOscillator() {
      return {
        type: 'sine',
        frequency: param(),
        connect: vi.fn(),
        start: vi.fn(() => {
          rec.voices += 1;
        }),
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
      const panner = {
        panningModel: '',
        distanceModel: '',
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
  return {
    get voices() {
      return rec.voices;
    },
    panners,
  };
}

describe('audio manager', () => {
  const originalAudio = window.AudioContext;
  const originalWebkit = (
    window as typeof window & { webkitAudioContext?: unknown }
  ).webkitAudioContext;

  beforeEach(() => {
    resetAudioManager();
    resetAudioEngine();
    resetAudioUnlock();
    resetExplorerTarget();
    setAudioClock(() => 10_000);
  });

  afterEach(() => {
    resetAudioManager();
    resetAudioEngine();
    resetAudioUnlock();
    resetExplorerTarget();
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

  it('plays a synth voice for each store event', () => {
    const audio = installMockAudio();
    unlockAudio();
    const store = playingStore();
    bindAudioStore(store);
    store.pieceBuilt('p1');
    store.gateOpened('g1');
    store.slimeStunned('s1');
    store.gemCollected('gem1');
    store.explorerBlocked('unbuiltGap');
    store.advanceBeat();
    store.completeCurrentBeat();
    store.win();
    store.leverPulled('lev1');
    expect(audio.voices).toBeGreaterThan(8);
    expect(SOUND_MANIFEST.pieceBuilt.synth).toBe('woodClick');
    expect(SOUND_MANIFEST.gateOpened.synth).toBe('marimbaRise');
    expect(SOUND_MANIFEST.beatCompleted.synth).toBe('marimbaRise');
    expect(SOUND_MANIFEST.won.synth).toBe('chimeSting');
  });

  it('plays leverPulled and gateOpened when pullLever emits', () => {
    const audio = installMockAudio();
    unlockAudio();
    const store = createGameStore({ clock: { now: () => 1000 } });
    store.requestLevel();
    store.startSurveying();
    store.startBuilding(SYNTHETIC_LIVING_ROOM_PLAN);
    store.startPlaying();
    bindAudioStore(store);
    const before = audio.voices;
    expect(pullLever(store, SYNTHETIC_LIVING_ROOM_PLAN, 'p4')).toBe(true);
    expect(audio.voices).toBeGreaterThan(before);
    expect(
      store.events.map((event) => event.type).slice(-2)
    ).toEqual(['leverPulled', 'gateOpened']);
  });

  it('plays grab, invalidPlace, and F-07 HUD actions as UI sounds', () => {
    const audio = installMockAudio();
    unlockAudio();
    const before = audio.voices;
    playUiSound('grab');
    playUiSound('invalidPlace');
    playUiSound('pause');
    playUiSound('resume');
    playUiSound('replay');
    playUiSound('exit');
    expect(audio.voices).toBeGreaterThan(before);
    expect(SOUND_MANIFEST.invalidPlace.synth).toBe('mutedThud');
    expect(SOUND_MANIFEST.pause.synth).toBe('woodClick');
    expect(SOUND_MANIFEST.won.synth).toBe('chimeSting');
  });

  it('spatially chirps at the ExplorerTarget and respects cooldown', () => {
    const audio = installMockAudio();
    unlockAudio();
    setExplorerTarget({
      getWorldPosition(out) {
        out.x = 3;
        out.y = 1;
        out.z = -4;
        return out;
      },
    });
    let t = 0;
    setAudioClock(() => t);
    handleGameEvent(
      { type: 'explorerOutOfView', timestamp: 0, beatIndex: 0 },
      0
    );
    expect(audio.panners[0]?.setPosition).toHaveBeenCalledWith(3, 1, -4);
    const afterFirst = audio.voices;
    t = 500;
    handleGameEvent(
      { type: 'explorerOutOfView', timestamp: 500, beatIndex: 0 },
      500
    );
    expect(audio.voices).toBe(afterFirst);
    t = 5000;
    handleGameEvent(
      { type: 'explorerOutOfView', timestamp: 5000, beatIndex: 0 },
      5000
    );
    expect(audio.voices).toBeGreaterThan(afterFirst);
    expect(SOUND_MANIFEST.explorerOutOfView.spatial).toBe(true);
    expect(SOUND_MANIFEST.explorerOutOfView.randomPitchCents).toBeGreaterThan(0);
  });
});
