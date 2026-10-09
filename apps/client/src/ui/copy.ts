/**
 * Player-facing HUD copy (F-04).
 * Short, English, brand-free.
 */

export const HUD_COPY = {
  surveyingTitle: 'Looking around',
  surveyingBodyRequesting: 'Getting ready...',
  surveyingBodySurveying: 'Reading your room...',
  surveyingBodyBuilding: 'Setting the scene...',
  dialogueFallback: 'Help me get there!',
  noSurfacesTitle: 'Need more space',
  noSurfacesBody: 'Set up your space in settings, then Retry.',
  retry: 'Retry',
  pauseTitle: 'Paused',
  resume: 'Resume',
  restart: 'Restart',
  exit: 'Exit',
  winTitle: 'You made it',
  replay: 'Replay',
  pause: 'Pause',
  beatFallback: 'Help the explorer onward',
  gazeFallback: 'Pinch a plank from the tray, then snap it on a gap.',
  onboardingFallback: 'Hi! Help me cross your room.',
  skip: 'Skip',
} as const;

/** 30-second first-run intro, spoken as explorer lines (F-06). */
export const ONBOARDING_DURATION_MS = 30_000;

export const ONBOARDING_STEPS: readonly { atMs: number; line: string }[] = [
  { atMs: 0, line: 'Hi! Help me cross your room.' },
  { atMs: 7_500, line: 'Pinch a plank. Drop it on a gap.' },
  { atMs: 15_000, line: 'Look at me for a hint.' },
  { atMs: 22_500, line: 'If I wander, follow the arrow.' },
];

export function formatHudTime(timeMs: number): string {
  const totalSeconds = Math.max(0, Math.floor(timeMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes)}:${String(seconds).padStart(2, '0')}`;
}

export function formatIsoDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${String(year)}-${month}-${day}`;
}

export function formatStarsLabel(stars: 1 | 2 | 3): string {
  return stars === 1 ? '1 star' : `${String(stars)} stars`;
}

export function formatWinStats(gems: number, timeMs: number): string {
  return `Gems ${String(gems)} - ${formatHudTime(timeMs)}`;
}

export function formatTomorrowLine(isoDate: string): string {
  return `New quest tomorrow - ${isoDate}`;
}

export function formatBeatLabel(beatIndex: number, beatCount: number): string {
  return `Beat ${String(beatIndex + 1)} of ${String(beatCount)}`;
}
