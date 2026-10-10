import {
  ROOM_READING_FADE_S,
  ROOM_READING_MAX_SURFACES,
  ROOM_READING_MIN_VISIBLE_S,
  ROOM_READING_PULSE_S,
} from './constants';
import type { RoomReadingPhase, RoomReadingRuntime } from './types';

export type DirectorFlightStatus =
  | 'idle'
  | 'requesting'
  | 'resolved'
  | 'fallback';

export function createRoomReadingRuntime(): RoomReadingRuntime {
  return {
    phase: 'idle',
    order: emptyOrder(),
    orderCount: 0,
    index: -1,
    pulseElapsedS: 0,
    fadeElapsedS: 0,
    elapsedS: 0,
    hadRealRequest: false,
    pulse: 0,
    fade: 0,
  };
}

function emptyOrder(): string[] {
  const order: string[] = [];
  for (let i = 0; i < ROOM_READING_MAX_SURFACES; i += 1) {
    order.push('');
  }
  return order;
}

function copyOrder(runtime: RoomReadingRuntime, ids: readonly string[]): void {
  const count = Math.min(ids.length, ROOM_READING_MAX_SURFACES);
  runtime.orderCount = count;
  for (let i = 0; i < ROOM_READING_MAX_SURFACES; i += 1) {
    runtime.order[i] = i < count ? (ids[i] ?? '') : '';
  }
}

function beginSweep(
  runtime: RoomReadingRuntime,
  ids: readonly string[],
  hadRealRequest: boolean
): void {
  copyOrder(runtime, ids);
  runtime.phase = runtime.orderCount > 0 ? 'sweeping' : 'done';
  runtime.index = runtime.orderCount > 0 ? 0 : -1;
  runtime.pulseElapsedS = 0;
  runtime.fadeElapsedS = 0;
  runtime.elapsedS = 0;
  runtime.hadRealRequest = hadRealRequest;
  runtime.pulse = runtime.orderCount > 0 ? pulseAt(0) : 0;
  runtime.fade = runtime.orderCount > 0 ? 1 : 0;
}

function hide(runtime: RoomReadingRuntime, phase: RoomReadingPhase): void {
  runtime.phase = phase;
  runtime.index = -1;
  runtime.pulseElapsedS = 0;
  runtime.fadeElapsedS = 0;
  runtime.pulse = 0;
  runtime.fade = 0;
}

export function resetRoomReading(runtime: RoomReadingRuntime): void {
  hide(runtime, 'idle');
  runtime.orderCount = 0;
  runtime.elapsedS = 0;
  runtime.hadRealRequest = false;
  for (let i = 0; i < ROOM_READING_MAX_SURFACES; i += 1) {
    runtime.order[i] = '';
  }
}

/**
 * Drive the sequencer from `onDirectorRequest` statuses.
 * `director=off` / `mock` jump to `done` (no min-duration).
 */
export function applyDirectorStatus(
  runtime: RoomReadingRuntime,
  status: DirectorFlightStatus,
  order: readonly string[]
): void {
  if (status === 'requesting') {
    beginSweep(runtime, order, true);
    return;
  }
  if (status === 'resolved' || status === 'fallback') {
    if (runtime.phase === 'sweeping' && runtime.hadRealRequest) {
      runtime.phase = 'closing';
      return;
    }
    if (!runtime.hadRealRequest) {
      hide(runtime, 'done');
    }
    return;
  }
  resetRoomReading(runtime);
}

export function roomReadingSurfaceId(
  runtime: RoomReadingRuntime
): string | null {
  if (runtime.index < 0 || runtime.index >= runtime.orderCount) {
    return null;
  }
  const id = runtime.order[runtime.index];
  return id && id.length > 0 ? id : null;
}

export function roomReadingIntensity(runtime: RoomReadingRuntime): number {
  return runtime.pulse * runtime.fade;
}

export function isRoomReadingVisible(runtime: RoomReadingRuntime): boolean {
  return roomReadingIntensity(runtime) > 0;
}

export function isRoomReadingBusy(runtime: RoomReadingRuntime): boolean {
  return (
    runtime.phase === 'sweeping' ||
    runtime.phase === 'closing' ||
    runtime.phase === 'fading'
  );
}

function pulseAt(pulseElapsedS: number): number {
  const t = pulseElapsedS / ROOM_READING_PULSE_S;
  return 0.55 + 0.45 * (0.5 + 0.5 * Math.sin(t * Math.PI * 2));
}

function advancePulse(runtime: RoomReadingRuntime, dt: number): void {
  runtime.pulseElapsedS += dt;
  if (runtime.pulseElapsedS >= ROOM_READING_PULSE_S) {
    runtime.pulseElapsedS -= ROOM_READING_PULSE_S;
    if (runtime.orderCount > 0) {
      runtime.index = (runtime.index + 1) % runtime.orderCount;
    }
  }
  runtime.pulse = pulseAt(runtime.pulseElapsedS);
}

function finishCurrentPulse(runtime: RoomReadingRuntime, dt: number): boolean {
  runtime.pulseElapsedS += dt;
  if (runtime.pulseElapsedS >= ROOM_READING_PULSE_S) {
    runtime.pulse = pulseAt(ROOM_READING_PULSE_S);
    return true;
  }
  runtime.pulse = pulseAt(runtime.pulseElapsedS);
  return false;
}

function startFade(runtime: RoomReadingRuntime): void {
  runtime.phase = 'fading';
  runtime.fadeElapsedS = 0;
  if (runtime.pulse <= 0) {
    runtime.pulse = 1;
  }
  runtime.fade = 1;
}

/**
 * Advance the sweep with injected `dt` seconds. Never reads wall-clock.
 */
export function tickRoomReading(
  runtime: RoomReadingRuntime,
  dt: number
): void {
  if (dt <= 0) {
    return;
  }
  if (
    runtime.phase === 'idle' ||
    runtime.phase === 'done' ||
    runtime.orderCount === 0
  ) {
    return;
  }

  runtime.elapsedS += dt;

  if (runtime.phase === 'sweeping') {
    advancePulse(runtime, dt);
    runtime.fade = 1;
    return;
  }

  if (runtime.phase === 'closing') {
    runtime.fade = 1;
    if (runtime.elapsedS < ROOM_READING_MIN_VISIBLE_S) {
      advancePulse(runtime, dt);
      return;
    }
    if (finishCurrentPulse(runtime, dt)) {
      startFade(runtime);
    }
    return;
  }

  runtime.fadeElapsedS += dt;
  const fadeT = runtime.fadeElapsedS / ROOM_READING_FADE_S;
  if (fadeT >= 1) {
    hide(runtime, 'done');
    return;
  }
  runtime.fade = 1 - fadeT;
}
