import { afterEach, describe, expect, it, vi } from 'vitest';
import { pingWithTimeout } from './ping';

describe('pingWithTimeout', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns true when the query resolves', async () => {
    await expect(
      pingWithTimeout(() => Promise.resolve(1), 2_000)
    ).resolves.toBe(true);
  });

  it('returns false when the query rejects', async () => {
    await expect(
      pingWithTimeout(() => Promise.reject(new Error('down')), 2_000)
    ).resolves.toBe(false);
  });

  it('returns false after the timeout using fake timers', async () => {
    vi.useFakeTimers();
    const pending = pingWithTimeout(() => new Promise(() => undefined), 2_000);
    await vi.advanceTimersByTimeAsync(2_000);
    await expect(pending).resolves.toBe(false);
  });
});
