/**
 * 1-second rolling FPS from a preallocated timestamp ring.
 * `push` / `fps` allocate nothing after construction.
 */

export const ROLLING_FPS_WINDOW_MS = 1000;
export const ROLLING_FPS_CAPACITY = 256;

export class RollingFps {
  private readonly stamps: Float64Array;
  private readonly capacity: number;
  private head = 0;
  private size = 0;

  constructor(capacity = ROLLING_FPS_CAPACITY) {
    const safe = capacity < 2 ? 2 : capacity;
    this.stamps = new Float64Array(safe);
    this.capacity = safe;
  }

  /** Record a frame timestamp in milliseconds. */
  push(nowMs: number): void {
    this.stamps[this.head] = nowMs;
    this.head = (this.head + 1) % this.capacity;
    if (this.size < this.capacity) this.size += 1;
  }

  /**
   * Frames-per-second over the last `windowMs` (default 1 s).
   * Uses (samples-in-window - 1) / span so a steady 16.67 ms cadence is 60.
   */
  fps(nowMs: number, windowMs = ROLLING_FPS_WINDOW_MS): number {
    if (this.size < 2) return 0;

    const cutoff = nowMs - windowMs;
    const cap = this.capacity;
    let count = 0;
    let oldest = nowMs;

    for (let i = 0; i < this.size; i += 1) {
      const idx = (this.head - 1 - i + cap) % cap;
      const t = this.stamps[idx] ?? Number.NEGATIVE_INFINITY;
      if (t < cutoff) break;
      count += 1;
      oldest = t;
    }

    if (count < 2) return 0;
    const span = nowMs - oldest;
    if (span <= 0) return 0;
    return ((count - 1) / span) * 1000;
  }

  get sampleCount(): number {
    return this.size;
  }
}
