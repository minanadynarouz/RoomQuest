import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { LevelPlan, SurfaceGraph } from '@roomquest/schema';
import { createGameStore } from '../game/index.js';
import { createSessionController } from './session.js';

function mockPlan(): LevelPlan {
  return {
    seed: 'room-2026-10-09',
    theme: 'forest',
    title: 'Test',
    start: 's1',
    goal: 's2',
    placements: [
      {
        id: 'p1',
        piece: 'village_hut',
        surface: 's1',
        u: 0.5,
        v: 0.5,
        playerBuilt: false,
        links: [],
      },
      {
        id: 'p2',
        piece: 'crystal_shrine',
        surface: 's2',
        u: 0.5,
        v: 0.5,
        playerBuilt: false,
        links: [],
      },
      {
        id: 'p3',
        piece: 'gem',
        surface: 's1',
        u: 0.2,
        v: 0.2,
        playerBuilt: false,
        links: [],
      },
      {
        id: 'p4',
        piece: 'plank_bridge',
        surface: 's1',
        to: 's2',
        u: 1,
        v: 0.5,
        playerBuilt: true,
        links: [],
      },
    ],
    beats: [
      { goal: 'Go', uses: ['p4'] },
      { goal: 'Win', uses: ['p2'] },
    ],
    dialogue: [],
    parTimeMs: 180000,
  };
}

const GRAPH: SurfaceGraph = {
  version: 1,
  roomHash: 'f1a2b3c4d5e6',
  mode: 'scene',
  floorY: 0,
  nodes: [],
  edges: [],
};

const DEVICE = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';

describe('createSessionController', () => {
  let now = 0;
  const posts: unknown[] = [];
  const builder = { build: vi.fn() };
  const explorer = {
    pause: vi.fn(),
    resume: vi.fn(),
    begin: vi.fn(),
  };
  const world = { exitXR: vi.fn() };
  const showLanding = vi.fn();

  beforeEach(() => {
    now = 0;
    posts.length = 0;
    builder.build.mockClear();
    explorer.pause.mockClear();
    explorer.resume.mockClear();
    explorer.begin.mockClear();
    world.exitXR.mockClear();
    showLanding.mockClear();
  });

  function playing() {
    const store = createGameStore({ clock: { now: () => now } });
    store.requestLevel();
    store.startSurveying();
    store.startBuilding(mockPlan(), {
      source: 'procedural',
      cacheKey: 'procedural:room-2026-10-09',
      tier: 'normal',
    });
    now = 1000;
    store.startPlaying();
    const session = createSessionController({
      store,
      getWorld: () => world,
      getBuilder: () => builder,
      getExplorer: () => explorer,
      getGraph: () => GRAPH,
      postResult: (input) => {
        posts.push(input);
      },
      deviceId: DEVICE,
      showLanding,
    });
    return { store, session };
  }

  it('pauses the store and explorer, then resumes', () => {
    const { store, session } = playing();
    now = 3000;
    session.pause();
    expect(store.phase).toBe('paused');
    expect(explorer.pause).toHaveBeenCalledOnce();
    expect(store.elapsedMs).toBe(2000);
    now = 8000;
    expect(store.elapsedMs).toBe(2000);
    session.resume();
    expect(store.phase).toBe('playing');
    expect(explorer.resume).toHaveBeenCalledOnce();
  });

  it('auto-pauses on XR hidden/blur and not on visible', () => {
    const { store, session } = playing();
    session.onVisibilityState('visible');
    expect(store.phase).toBe('playing');
    session.onVisibilityState('hidden');
    expect(store.phase).toBe('paused');
  });

  it('replays by rebuilding the level and restarting the explorer', () => {
    const { store, session } = playing();
    store.win();
    session.replay();
    expect(store.phase).toBe('playing');
    expect(builder.build).toHaveBeenCalledWith(store.plan, GRAPH);
    expect(explorer.begin).toHaveBeenCalled();
  });

  it('posts a completed result on win with proc key for fallback levels', () => {
    const { store, session } = playing();
    store.gemCollected('p3');
    now = 1000 + 50_000;
    store.win();
    session.dispose();
    expect(posts).toHaveLength(1);
    expect(posts[0]).toMatchObject({
      levelKey: 'proc:room-2026-10-09:normal',
      completed: true,
      planSource: 'procedural',
      deviceId: DEVICE,
      gems: 1,
      stars: 3,
      timeMs: 50_000,
    });
  });

  it('posts completed:false on quit and returns to landing', () => {
    const { store, session } = playing();
    session.exit();
    expect(store.phase).toBe('landing');
    expect(world.exitXR).toHaveBeenCalledOnce();
    expect(showLanding).toHaveBeenCalledOnce();
    expect(posts).toHaveLength(1);
    expect(posts[0]).toMatchObject({
      completed: false,
      stars: 0,
      planSource: 'procedural',
      levelKey: 'proc:room-2026-10-09:normal',
    });
  });

  it('does not post a second result when exiting after a win', () => {
    const { session, store } = playing();
    store.win();
    session.exit();
    expect(posts).toHaveLength(1);
    expect((posts[0] as { completed: boolean }).completed).toBe(true);
  });

  it('rescan restarts surveying and the room scan', () => {
    const rescanRoom = vi.fn();
    const store = createGameStore({ clock: { now: () => now } });
    store.requestLevel();
    store.startSurveying();
    store.markRoomUnplayable();
    const session = createSessionController({
      store,
      getWorld: () => world,
      getBuilder: () => builder,
      getExplorer: () => explorer,
      getGraph: () => GRAPH,
      postResult: (input) => {
        posts.push(input);
      },
      deviceId: DEVICE,
      showLanding,
      rescanRoom,
    });
    session.rescan?.();
    expect(store.phase).toBe('surveying');
    expect(rescanRoom).toHaveBeenCalledOnce();
    session.dispose();
  });

  it('forceWin reaches won from playing and from pause', () => {
    const { store, session } = playing();
    session.pause();
    session.forceWin();
    expect(store.phase).toBe('won');
    expect(posts).toHaveLength(1);
  });
});
