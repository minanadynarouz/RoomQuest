import { describe, expect, it } from 'vitest';
import {
  ROOM_READING_FADE_S,
  ROOM_READING_MIN_VISIBLE_S,
  ROOM_READING_PULSE_S,
} from './constants';
import {
  applyDirectorStatus,
  createRoomReadingRuntime,
  isRoomReadingBusy,
  isRoomReadingVisible,
  resetRoomReading,
  roomReadingIntensity,
  roomReadingSurfaceId,
  tickRoomReading,
} from './sequencer';

const ORDER = ['s5', 's2', 's1'] as const;
const DT = 1 / 72;

function tickFor(runtime: ReturnType<typeof createRoomReadingRuntime>, seconds: number): void {
  let left = seconds;
  while (left > 1e-9) {
    const step = left > DT ? DT : left;
    tickRoomReading(runtime, step);
    left -= step;
  }
}

describe('tickRoomReading (injected delta time)', () => {
  it('stays idle until a real requesting status', () => {
    const runtime = createRoomReadingRuntime();
    tickRoomReading(runtime, 1);
    expect(runtime.phase).toBe('idle');
    expect(isRoomReadingVisible(runtime)).toBe(false);
    expect(isRoomReadingBusy(runtime)).toBe(false);
  });

  it('sweeps largest-first and loops while requesting', () => {
    const runtime = createRoomReadingRuntime();
    applyDirectorStatus(runtime, 'requesting', ORDER);
    expect(runtime.phase).toBe('sweeping');
    expect(roomReadingSurfaceId(runtime)).toBe('s5');
    expect(isRoomReadingVisible(runtime)).toBe(true);

    tickFor(runtime, ROOM_READING_PULSE_S);
    expect(roomReadingSurfaceId(runtime)).toBe('s2');

    tickFor(runtime, ROOM_READING_PULSE_S);
    expect(roomReadingSurfaceId(runtime)).toBe('s1');

    tickFor(runtime, ROOM_READING_PULSE_S);
    expect(roomReadingSurfaceId(runtime)).toBe('s5');
    expect(runtime.phase).toBe('sweeping');
  });

  it('keeps sweeping until the 1.2 s minimum after a fast resolve', () => {
    const runtime = createRoomReadingRuntime();
    applyDirectorStatus(runtime, 'requesting', ORDER);
    tickFor(runtime, 0.2);
    applyDirectorStatus(runtime, 'resolved', ORDER);
    expect(runtime.phase).toBe('closing');

    tickFor(runtime, ROOM_READING_MIN_VISIBLE_S - 0.25);
    expect(runtime.elapsedS).toBeLessThan(ROOM_READING_MIN_VISIBLE_S);
    expect(runtime.phase).toBe('closing');
    expect(isRoomReadingVisible(runtime)).toBe(true);

    tickFor(runtime, ROOM_READING_PULSE_S + 0.2);
    expect(runtime.elapsedS).toBeGreaterThanOrEqual(ROOM_READING_MIN_VISIBLE_S);
    expect(runtime.phase).toBe('fading');
  });

  it('finishes the current pulse then fades ~0.4 s after a long request', () => {
    const runtime = createRoomReadingRuntime();
    applyDirectorStatus(runtime, 'requesting', ORDER);
    tickFor(runtime, 3);
    const surfaceAtResolve = roomReadingSurfaceId(runtime);
    const pulseLeft = ROOM_READING_PULSE_S - runtime.pulseElapsedS;
    applyDirectorStatus(runtime, 'fallback', ORDER);
    expect(runtime.phase).toBe('closing');

    tickFor(runtime, Math.max(0, pulseLeft - 0.02));
    expect(runtime.phase).toBe('closing');
    expect(roomReadingSurfaceId(runtime)).toBe(surfaceAtResolve);

    tickFor(runtime, 0.05);
    expect(runtime.phase).toBe('fading');

    const intensityStart = roomReadingIntensity(runtime);
    tickFor(runtime, ROOM_READING_FADE_S * 0.5);
    expect(runtime.phase).toBe('fading');
    expect(roomReadingIntensity(runtime)).toBeLessThan(intensityStart);

    tickFor(runtime, ROOM_READING_FADE_S);
    expect(runtime.phase).toBe('done');
    expect(isRoomReadingVisible(runtime)).toBe(false);
    expect(isRoomReadingBusy(runtime)).toBe(false);
  });

  it('skips min-duration when director=off/mock never requested', () => {
    const runtime = createRoomReadingRuntime();
    applyDirectorStatus(runtime, 'fallback', ORDER);
    expect(runtime.phase).toBe('done');
    expect(runtime.hadRealRequest).toBe(false);
    expect(isRoomReadingVisible(runtime)).toBe(false);
    tickFor(runtime, ROOM_READING_MIN_VISIBLE_S);
    expect(runtime.phase).toBe('done');
    expect(isRoomReadingVisible(runtime)).toBe(false);
  });

  it('ignores zero/negative dt and idle ticks', () => {
    const runtime = createRoomReadingRuntime();
    applyDirectorStatus(runtime, 'requesting', ORDER);
    const elapsed = runtime.elapsedS;
    tickRoomReading(runtime, 0);
    tickRoomReading(runtime, -0.2);
    expect(runtime.elapsedS).toBe(elapsed);
  });

  it('resets to idle on director idle', () => {
    const runtime = createRoomReadingRuntime();
    applyDirectorStatus(runtime, 'requesting', ORDER);
    tickFor(runtime, 0.3);
    applyDirectorStatus(runtime, 'idle', ORDER);
    expect(runtime.phase).toBe('idle');
    expect(runtime.hadRealRequest).toBe(false);
    expect(roomReadingSurfaceId(runtime)).toBeNull();
  });

  it('hides immediately when the order is empty', () => {
    const runtime = createRoomReadingRuntime();
    applyDirectorStatus(runtime, 'requesting', []);
    expect(runtime.phase).toBe('done');
    expect(isRoomReadingVisible(runtime)).toBe(false);
  });

  it('resetRoomReading clears a mid-sweep runtime', () => {
    const runtime = createRoomReadingRuntime();
    applyDirectorStatus(runtime, 'requesting', ORDER);
    tickFor(runtime, 0.4);
    resetRoomReading(runtime);
    expect(runtime.phase).toBe('idle');
    expect(runtime.orderCount).toBe(0);
    expect(roomReadingIntensity(runtime)).toBe(0);
  });
});
