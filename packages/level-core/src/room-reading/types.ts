export type RoomReadingPhase =
  | 'idle'
  | 'sweeping'
  | 'closing'
  | 'fading'
  | 'done';

/**
 * Mutable sequencer. `tickRoomReading` writes in place so the XR system
 * never allocates per frame.
 */
export interface RoomReadingRuntime {
  phase: RoomReadingPhase;
  /** Preallocated surface-id slots; only `[0, orderCount)` are live. */
  order: string[];
  orderCount: number;
  index: number;
  pulseElapsedS: number;
  fadeElapsedS: number;
  elapsedS: number;
  /** True only after a `requesting` status (not director=off/mock). */
  hadRealRequest: boolean;
  /** 0..1 in-pulse envelope (0 at the edges, 1 at mid-pulse). */
  pulse: number;
  /** 1 while showing, 0..1 during fade-out. */
  fade: number;
}
