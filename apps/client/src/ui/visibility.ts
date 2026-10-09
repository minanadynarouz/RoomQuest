/**
 * Store → HUD panel visibility and copy (F-04).
 *
 * Pure mapping over the F-02 public store snapshot. No DOM, IWSDK, or Three.
 */

import type {
  GameEvent,
  GamePhase,
  GameResult,
  GameStore,
} from '../game/index.js';
import type { LevelPlan } from '@roomquest/schema';
import {
  formatBeatLabel,
  formatIsoDate,
  formatStarsLabel,
  formatTomorrowLine,
  formatWinStats,
  HUD_COPY,
} from './copy.js';

export type HudPanelId =
  'surveying' | 'dialogue' | 'beatGoal' | 'noSurfaces' | 'pause' | 'win';

export interface HudStoreSnapshot {
  phase: GamePhase;
  plan: LevelPlan | null;
  currentBeatIndex: number;
  events: readonly GameEvent[];
  result: GameResult | null;
  error: string | null;
  todayIso: string;
}

export interface HudPanelContent {
  surveying: { visible: boolean; title: string; body: string };
  dialogue: {
    visible: boolean;
    line: string;
    skipVisible: boolean;
    skipLabel: string;
  };
  beatGoal: {
    visible: boolean;
    goal: string;
    beatLabel: string;
    pauseLabel: string;
  };
  noSurfaces: {
    visible: boolean;
    title: string;
    body: string;
    retryLabel: string;
  };
  pause: {
    visible: boolean;
    title: string;
    resumeLabel: string;
    restartLabel: string;
    exitLabel: string;
  };
  win: {
    visible: boolean;
    title: string;
    starsLabel: string;
    statsLabel: string;
    tomorrowLabel: string;
    replayLabel: string;
    exitLabel: string;
  };
}

const SURVEYING_PHASES: ReadonlySet<GamePhase> = new Set([
  'requesting',
  'surveying',
  'building',
]);

function surveyingBody(phase: GamePhase): string {
  if (phase === 'requesting') return HUD_COPY.surveyingBodyRequesting;
  if (phase === 'building') return HUD_COPY.surveyingBodyBuilding;
  return HUD_COPY.surveyingBodySurveying;
}

function currentBeatGoal(plan: LevelPlan | null, beatIndex: number): string {
  const goal = plan?.beats[beatIndex]?.goal.trim();
  return goal && goal.length > 0 ? goal : HUD_COPY.beatFallback;
}

export interface DialogueOverlay {
  line?: string | null;
  skipVisible?: boolean;
}

/**
 * Current beat's gaze hint (plan `gaze` line, else a short fallback).
 */
export function selectGazeHint(plan: LevelPlan | null): string {
  const gaze = plan?.dialogue.find((line) => line.trigger === 'gaze')?.line.trim();
  return gaze && gaze.length > 0 ? gaze : HUD_COPY.gazeFallback;
}

/**
 * Pick the explorer line from the plan + events.
 * Intro until the first beat completes; stuck line if this beat is blocked;
 * otherwise the beat line, then the current beat goal.
 */
export function selectDialogueLine(
  phase: GamePhase,
  plan: LevelPlan | null,
  beatIndex: number,
  events: readonly GameEvent[]
): string | null {
  if (!plan) return null;
  if (phase !== 'playing' && phase !== 'paused') return null;

  const dialogue = plan.dialogue;
  for (let i = events.length - 1; i >= 0; i--) {
    const event = events[i];
    if (event?.type === 'explorerBlocked' && event.beatIndex === beatIndex) {
      const stuck = dialogue.find((line) => line.trigger === 'stuck')?.line;
      if (stuck) return stuck;
      break;
    }
  }

  const completed = events.some((event) => event.type === 'beatCompleted');
  if (!completed) {
    return (
      dialogue.find((line) => line.trigger === 'intro')?.line ??
      dialogue[0]?.line ??
      HUD_COPY.dialogueFallback
    );
  }

  return (
    dialogue.find((line) => line.trigger === 'beat')?.line ??
    currentBeatGoal(plan, beatIndex)
  );
}

export function snapshotGameStore(
  store: GameStore,
  today: Date = new Date()
): HudStoreSnapshot {
  const state = store.state;
  return {
    phase: store.phase,
    plan: store.plan,
    currentBeatIndex: state.currentBeatIndex,
    events: store.events,
    result: store.result,
    error: state.error,
    todayIso: formatIsoDate(today),
  };
}

export function mapStoreToHud(
  snapshot: HudStoreSnapshot,
  overlay?: DialogueOverlay
): HudPanelContent {
  const { phase, plan, currentBeatIndex, events, result, todayIso } = snapshot;
  const surveyingVisible = SURVEYING_PHASES.has(phase);
  const playing = phase === 'playing';
  const paused = phase === 'paused';
  const won = phase === 'won';
  const noSurfaces = phase === 'noSurfaces';

  const storeLine = selectDialogueLine(
    phase,
    plan,
    currentBeatIndex,
    events
  );
  const overlayLine = playing ? overlay?.line ?? null : null;
  const dialogueLine = overlayLine && overlayLine.length > 0 ? overlayLine : storeLine;
  const beatCount = plan?.beats.length ?? 0;

  const stars = result?.stars ?? 1;
  const gems = result?.gems ?? 0;
  const timeMs = result?.timeMs ?? 0;
  const winDialogue =
    plan?.dialogue.find((line) => line.trigger === 'win')?.line ??
    HUD_COPY.winTitle;

  return {
    surveying: {
      visible: surveyingVisible,
      title: HUD_COPY.surveyingTitle,
      body: surveyingBody(phase),
    },
    dialogue: {
      visible: playing && dialogueLine !== null,
      line: dialogueLine ?? '',
      skipVisible: playing && Boolean(overlay?.skipVisible),
      skipLabel: HUD_COPY.skip,
    },
    beatGoal: {
      visible: playing,
      goal: currentBeatGoal(plan, currentBeatIndex),
      beatLabel: formatBeatLabel(currentBeatIndex, Math.max(beatCount, 1)),
      pauseLabel: HUD_COPY.pause,
    },
    noSurfaces: {
      visible: noSurfaces,
      title: HUD_COPY.noSurfacesTitle,
      body: HUD_COPY.noSurfacesBody,
      retryLabel: HUD_COPY.retry,
    },
    pause: {
      visible: paused,
      title: HUD_COPY.pauseTitle,
      resumeLabel: HUD_COPY.resume,
      restartLabel: HUD_COPY.restart,
      exitLabel: HUD_COPY.exit,
    },
    win: {
      visible: won,
      title: winDialogue,
      starsLabel: formatStarsLabel(stars),
      statsLabel: formatWinStats(gems, timeMs),
      tomorrowLabel: formatTomorrowLine(todayIso),
      replayLabel: HUD_COPY.replay,
      exitLabel: HUD_COPY.done,
    },
  };
}

export function visiblePanelIds(view: HudPanelContent): HudPanelId[] {
  const ids: HudPanelId[] = [
    'surveying',
    'dialogue',
    'beatGoal',
    'noSurfaces',
    'pause',
    'win',
  ];
  return ids.filter((id) => view[id].visible);
}
