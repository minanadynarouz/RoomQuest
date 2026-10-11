import { describe, expect, it } from 'vitest';
import type { LevelPlan } from '@roomquest/schema';
import { createGameStore, type GameEvent } from '../game/index.js';
import {
  mapStoreToHud,
  snapshotGameStore,
  SPEECH_CARD_MS,
  visiblePanelIds,
} from './visibility.js';

function plan(): LevelPlan {
  return {
    seed: 'speech',
    theme: 'forest',
    title: 'Speech',
    start: 's1',
    goal: 's2',
    placements: [],
    beats: [
      { goal: 'One', uses: [] },
      { goal: 'Two', uses: [] },
      { goal: 'Three', uses: [] },
    ],
    dialogue: [],
    parTimeMs: 180000,
  };
}

function setup(lines?: { beat: string; text: string }[]) {
  let now = 1000;
  const clock = { now: () => now };
  const store = createGameStore({ clock });
  const pip: GameEvent[] = [];
  store.subscribeEvents((event) => {
    if (event.type === 'pipLine') pip.push(event);
  });
  store.requestLevel();
  store.startSurveying();
  store.startBuilding(plan(), { source: 'llm', lines });
  return {
    store,
    pip,
    advance(ms: number) {
      now += ms;
    },
    view: () => mapStoreToHud(snapshotGameStore(store)),
  };
}

const LINES = [
  { beat: '0', text: 'Here we go!' },
  { beat: '2', text: 'Almost home.' },
];

describe('Pip speech cards', () => {
  it('shows a card and emits pipLine when a beat with a line activates', () => {
    const t = setup(LINES);
    t.store.startPlaying();
    expect(t.pip).toEqual([
      expect.objectContaining({ type: 'pipLine', beat: '0', text: 'Here we go!' }),
    ]);
    const view = t.view();
    expect(view.speechCard).toEqual({
      visible: true,
      beat: '0',
      text: 'Here we go!',
    });
    expect(visiblePanelIds(view)).toContain('speechCard');
  });

  it('hides after ~4 s', () => {
    const t = setup(LINES);
    t.store.startPlaying();
    t.advance(SPEECH_CARD_MS - 1);
    expect(t.view().speechCard.visible).toBe(true);
    t.advance(1);
    expect(t.view().speechCard.visible).toBe(false);
  });

  it('is replaced by the next beat (nothing if that beat has no line)', () => {
    const t = setup(LINES);
    t.store.startPlaying();
    t.store.advanceBeat();
    expect(t.view().speechCard.visible).toBe(false);
    t.store.advanceBeat();
    expect(t.view().speechCard.text).toBe('Almost home.');
    expect(t.pip.map((e) => e.type === 'pipLine' && e.beat)).toEqual(['0', '2']);
  });

  it('shows nothing and emits nothing without lines', () => {
    const t = setup(undefined);
    t.store.startPlaying();
    t.store.advanceBeat();
    t.store.advanceBeat();
    expect(t.pip).toEqual([]);
    expect(t.view().speechCard.visible).toBe(false);
    expect(t.view().beatGoal.visible).toBe(true);
    expect(t.store.level.lines).toEqual({});
  });

  it('hides during pause and on win', () => {
    const t = setup(LINES);
    t.store.startPlaying();
    t.store.pause();
    expect(t.view().speechCard.visible).toBe(false);
    expect(visiblePanelIds(t.view())).not.toContain('speechCard');
    t.store.resume();
    expect(t.view().speechCard.visible).toBe(true);
    t.store.win();
    expect(t.view().speechCard.visible).toBe(false);
  });

  it('replays the beat-0 line on replay', () => {
    const t = setup(LINES);
    t.store.startPlaying();
    t.store.win();
    t.store.replay();
    t.store.startPlaying();
    expect(t.pip).toHaveLength(2);
    expect(t.view().speechCard.visible).toBe(true);
  });
});
