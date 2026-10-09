import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createGameStore } from '../game/store.js';
import type { LevelPlan } from '@roomquest/schema';
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
import { putAudioBuffer, resetAudioEngine } from './engine.js';
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

function installMockAudio(): { started: unknown[]; panners: MockPanner[] } {
  const started: unknown[] = [];
  const panners: MockPanner[] = [];
  class MockAudioContext {
    state = 'running';
    currentTime = 0;
    destination = {};
    resume = vi.fn(() => Promise.resolve());
    decodeAudioData = vi.fn((data: ArrayBuffer) => Promise.resolve(data));
    createGain() {
      return { gain: { value: 1 }, connect: vi.fn() };
    }
    createBufferSource() {
      const source = {
        buffer: null as unknown,
        connect: vi.fn(),
        start: vi.fn(() => {
          started.push(source.buffer);
        }),
      };
      return source;
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
  (window as unknown as { AudioContext: typeof MockAudioContext }).AudioContext =
    MockAudioContext;
  return { started, panners };
}

describe('audio manager', () => {
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
  });

  it('plays the mapped sound for each store event', () => {
    const { started } = installMockAudio();
    unlockAudio();
    const buffers = {
      pieceBuilt: { id: 'snap' },
      gateOpened: { id: 'gate' },
      slimeStunned: { id: 'stun' },
      gemCollected: { id: 'gem' },
      explorerBlocked: { id: 'blocked' },
      beatCompleted: { id: 'beat' },
      won: { id: 'win' },
      leverPulled: { id: 'lever' },
    };
    for (const [id, buffer] of Object.entries(buffers)) {
      putAudioBuffer(id as keyof typeof buffers, buffer);
    }

    const store = playingStore();
    bindAudioStore(store);
    store.pieceBuilt('p1');
    store.gateOpened('g1');
    store.slimeStunned('s1');
    store.gemCollected('gem1');
    store.explorerBlocked('unbuiltGap');
    store.advanceBeat();
    store.win();
    store.leverPulled('lev1');

    expect(started).toContain(buffers.pieceBuilt);
    expect(started).toContain(buffers.gateOpened);
    expect(started).toContain(buffers.slimeStunned);
    expect(started).toContain(buffers.gemCollected);
    expect(started).toContain(buffers.explorerBlocked);
    expect(started).toContain(buffers.beatCompleted);
    expect(started).toContain(buffers.won);
    expect(started).toContain(buffers.leverPulled);
    expect(SOUND_MANIFEST.pieceBuilt.file).toBe('snap.ogg');
  });

  it('plays grab as a UI sound (not a store event)', () => {
    const { started } = installMockAudio();
    unlockAudio();
    const grab = { id: 'grab' };
    putAudioBuffer('grab', grab);
    playUiSound('grab');
    expect(started).toContain(grab);
  });

  it('spatially chirps at the ExplorerTarget and respects cooldown', () => {
    const { panners, started } = installMockAudio();
    unlockAudio();
    putAudioBuffer('explorerOutOfView', { id: 'chirp' });
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
    expect(panners[0]?.setPosition).toHaveBeenCalledWith(3, 1, -4);
    const afterFirst = started.length;
    t = 500;
    handleGameEvent(
      { type: 'explorerOutOfView', timestamp: 500, beatIndex: 0 },
      500
    );
    expect(started.length).toBe(afterFirst);
    t = 5000;
    handleGameEvent(
      { type: 'explorerOutOfView', timestamp: 5000, beatIndex: 0 },
      5000
    );
    expect(started.length).toBe(afterFirst + 1);
  });
});
