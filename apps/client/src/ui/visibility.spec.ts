import { describe, expect, it } from 'vitest';
import { createGameStore, type Clock } from '../game/index.js';
import type { LevelPlan } from '@roomquest/schema';
import { HUD_COPY } from './copy.js';
import {
  mapStoreToHud,
  selectGazeHint,
  snapshotGameStore,
  visiblePanelIds,
} from './visibility.js';

function createClock(): Clock {
  return {
    now: () => 0,
  };
}

function mockPlan(overrides?: Partial<LevelPlan>): LevelPlan {
  return {
    seed: 'hud-test',
    theme: 'forest',
    title: 'Fallen Crystal',
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
      { goal: 'Bridge the gap', uses: ['p4'] },
      { goal: 'Reach the shrine', uses: ['p2'] },
    ],
    dialogue: [
      { trigger: 'intro', line: 'The crystal fell onto the couch.' },
      { trigger: 'beat', line: 'Open the way forward.' },
      { trigger: 'stuck', line: 'That gap is too wide.' },
      { trigger: 'win', line: 'Home at last.' },
    ],
    parTimeMs: 180000,
    ...overrides,
  };
}

function storeAt(
  phase:
    | 'landing'
    | 'requesting'
    | 'surveying'
    | 'building'
    | 'playing'
    | 'paused'
    | 'won'
    | 'noSurfaces'
    | 'error'
) {
  const clock = createClock();
  const store = createGameStore({ clock, onInvalidTransition: 'error' });
  const plan = mockPlan();

  if (phase === 'landing') {
    return { store, clock, plan, today: new Date(2026, 9, 9) };
  }

  store.requestLevel();
  if (phase === 'requesting') {
    return { store, clock, plan, today: new Date(2026, 9, 9) };
  }

  if (phase === 'error') {
    store.error('boom');
    return { store, clock, plan, today: new Date(2026, 9, 9) };
  }

  if (phase === 'noSurfaces') {
    store.startSurveying();
    store.noSurfaces();
    return { store, clock, plan, today: new Date(2026, 9, 9) };
  }

  store.startSurveying();
  if (phase === 'surveying') {
    return { store, clock, plan, today: new Date(2026, 9, 9) };
  }

  store.startBuilding(plan);
  if (phase === 'building') {
    return { store, clock, plan, today: new Date(2026, 9, 9) };
  }

  store.startPlaying();
  if (phase === 'playing') {
    return { store, clock, plan, today: new Date(2026, 9, 9) };
  }

  if (phase === 'paused') {
    store.pause();
    return { store, clock, plan, today: new Date(2026, 9, 9) };
  }

  store.win();
  return { store, clock, plan, today: new Date(2026, 9, 9) };
}

function viewFor(
  phase: Parameters<typeof storeAt>[0],
  mutate?: (store: ReturnType<typeof createGameStore>) => void
) {
  const { store, today } = storeAt(phase);
  mutate?.(store);
  return mapStoreToHud(snapshotGameStore(store, today));
}

describe('store-to-panel visibility mapping', () => {
  it('hides every panel on landing', () => {
    expect(visiblePanelIds(viewFor('landing'))).toEqual([]);
  });

  it('shows the surveying panel while requesting, surveying, and building', () => {
    for (const phase of ['requesting', 'surveying', 'building'] as const) {
      const view = viewFor(phase);
      expect(visiblePanelIds(view)).toEqual(['surveying']);
      expect(view.surveying.title).toBe(HUD_COPY.surveyingTitle);
    }
    expect(viewFor('requesting').surveying.body).toBe(
      HUD_COPY.surveyingBodyRequesting
    );
    expect(viewFor('surveying').surveying.body).toBe(
      HUD_COPY.surveyingBodySurveying
    );
    expect(viewFor('building').surveying.body).toBe(
      HUD_COPY.surveyingBodyBuilding
    );
  });

  it('shows the beat chip and intro dialogue while playing', () => {
    const view = viewFor('playing');
    expect(visiblePanelIds(view).sort()).toEqual(['beatGoal', 'dialogue']);
    expect(view.beatGoal.goal).toBe('Bridge the gap');
    expect(view.beatGoal.beatLabel).toBe('Beat 1 of 2');
    expect(view.dialogue.line).toBe('The crystal fell onto the couch.');
    expect(view.dialogue.skipVisible).toBe(false);
    expect(view.pause.visible).toBe(false);
    expect(view.win.visible).toBe(false);
    expect(view.surveying.visible).toBe(false);
  });

  it('uses the stuck line after explorerBlocked on the current beat', () => {
    const view = viewFor('playing', (store) => {
      store.explorerBlocked('unbuiltGap');
    });
    expect(view.dialogue.visible).toBe(true);
    expect(view.dialogue.line).toBe('That gap is too wide.');
  });

  it('advances the beat chip and beat dialogue after advanceBeat()', () => {
    const view = viewFor('playing', (store) => {
      store.advanceBeat();
    });
    expect(view.beatGoal.goal).toBe('Reach the shrine');
    expect(view.beatGoal.beatLabel).toBe('Beat 2 of 2');
    expect(view.dialogue.line).toBe('Open the way forward.');
  });

  it('shows only the pause panel while paused', () => {
    const view = viewFor('paused');
    expect(visiblePanelIds(view)).toEqual(['pause']);
    expect(view.pause.resumeLabel).toBe('Resume');
    expect(view.pause.restartLabel).toBe('Restart');
    expect(view.pause.exitLabel).toBe('Exit');
  });

  it('shows the win panel from result + win dialogue', () => {
    const view = viewFor('playing', (store) => {
      store.gemCollected('p3');
      store.gemCollected('p3');
      store.gemCollected('p3');
      store.win();
    });
    expect(visiblePanelIds(view)).toEqual(['win']);
    expect(view.win.title).toBe('Home at last.');
    expect(view.win.starsLabel).toBe('3 stars');
    expect(view.win.statsLabel).toContain('Gems 3');
    expect(view.win.tomorrowLabel).toBe('New quest tomorrow - 2026-10-09');
    expect(view.win.replayLabel).toBe('Replay');
    expect(view.win.exitLabel).toBe('Done');
  });

  it('shows the no-surfaces panel with Retry', () => {
    const view = viewFor('noSurfaces');
    expect(visiblePanelIds(view)).toEqual(['noSurfaces']);
    expect(view.noSurfaces.body).toBe(HUD_COPY.noSurfacesBody);
    expect(view.noSurfaces.retryLabel).toBe('Retry');
    expect(view.noSurfaces.body).not.toMatch(/quest/i);
  });

  it('hides HUD panels in the error phase', () => {
    expect(visiblePanelIds(viewFor('error'))).toEqual([]);
  });

  it('keeps modal panels mutually exclusive', () => {
    for (const phase of [
      'surveying',
      'playing',
      'paused',
      'won',
      'noSurfaces',
    ] as const) {
      const ids = visiblePanelIds(viewFor(phase));
      const modals = ids.filter((id) =>
        ['surveying', 'pause', 'win', 'noSurfaces'].includes(id)
      );
      expect(modals.length).toBeLessThanOrEqual(1);
    }
  });

  it('lets onboarding overlay the intro without hiding the beat chip', () => {
    const { store, today } = storeAt('playing');
    const view = mapStoreToHud(snapshotGameStore(store, today), {
      line: HUD_COPY.onboardingFallback,
      skipVisible: true,
    });
    expect(view.dialogue.line).toBe(HUD_COPY.onboardingFallback);
    expect(view.dialogue.skipVisible).toBe(true);
    expect(view.dialogue.skipLabel).toBe(HUD_COPY.skip);
    expect(view.beatGoal.visible).toBe(true);
    expect(view.beatGoal.goal).toBe('Bridge the gap');
  });

  it('shows the gaze hint overlay after onboarding', () => {
    const { store, today } = storeAt('playing');
    const plan = store.plan;
    const view = mapStoreToHud(snapshotGameStore(store, today), {
      line: selectGazeHint(plan),
      skipVisible: false,
    });
    expect(view.dialogue.line).toBe(HUD_COPY.gazeFallback);
    expect(view.dialogue.skipVisible).toBe(false);
  });

  it('picks the plan gaze line for hints', () => {
    const plan = mockPlan({
      dialogue: [
        { trigger: 'intro', line: 'Go.' },
        { trigger: 'gaze', line: 'Pinch a plank for the gap.' },
      ],
    });
    expect(selectGazeHint(plan)).toBe('Pinch a plank for the gap.');
  });

  it('reads beat index and result only through the public store API', () => {
    const { store, today } = storeAt('playing');
    store.gemCollected('p3');
    const snapshot = snapshotGameStore(store, today);
    expect(snapshot.currentBeatIndex).toBe(store.state.currentBeatIndex);
    expect(snapshot.phase).toBe(store.phase);
    expect(snapshot.plan).toBe(store.plan);
    expect(snapshot.result?.gems).toBe(store.result?.gems);
  });
});
