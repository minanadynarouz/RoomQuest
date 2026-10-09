import { describe, it, expect } from 'vitest';
import {
  cooldownUntilMs,
  parseRetryAfterS,
  remainingRetryAfterS,
} from './rate-limit.js';

describe('parseRetryAfterS', () => {
  it('reads retryAfterS from the RATE_LIMITED envelope', () => {
    expect(
      parseRetryAfterS({
        error: {
          code: 'RATE_LIMITED',
          message: 'Too many requests',
          retryAfterS: 3600,
        },
      })
    ).toBe(3600);
  });

  it('reads a bare top-level retryAfterS', () => {
    expect(parseRetryAfterS({ retryAfterS: 42 })).toBe(42);
  });

  it('reads retryAfterS nested under error without a matching envelope', () => {
    expect(
      parseRetryAfterS({
        error: { retryAfterS: 15 },
      })
    ).toBe(15);
  });

  it('returns undefined for unparseable or missing values', () => {
    expect(parseRetryAfterS(undefined)).toBeUndefined();
    expect(parseRetryAfterS(null)).toBeUndefined();
    expect(parseRetryAfterS({ oops: true })).toBeUndefined();
    expect(parseRetryAfterS({ retryAfterS: -1 })).toBeUndefined();
    expect(parseRetryAfterS({ retryAfterS: '60' })).toBeUndefined();
  });
});

describe('rate-limit cooldown clock', () => {
  it('skips until the injected clock passes the deadline', () => {
    const until = cooldownUntilMs(1_000, 60);
    expect(until).toBe(61_000);
    expect(remainingRetryAfterS(1_000, until)).toBe(60);
    expect(remainingRetryAfterS(31_000, until)).toBe(30);
    expect(remainingRetryAfterS(61_000, until)).toBeUndefined();
    expect(remainingRetryAfterS(62_000, until)).toBeUndefined();
  });

  it('returns undefined when no deadline is set', () => {
    expect(remainingRetryAfterS(1_000, undefined)).toBeUndefined();
  });
});
