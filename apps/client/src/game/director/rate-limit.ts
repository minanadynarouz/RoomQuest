/**
 * Client-side 429 handling for the director (F-03).
 * Pure helpers: parse retryAfterS from either the RATE_LIMITED envelope or a
 * bare `{retryAfterS}` body, and compute an in-memory skip-until deadline.
 * Clock is injected by the caller so tests stay deterministic.
 */

import { RateLimitError } from '@roomquest/schema';

function asNonNegativeNumber(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    return undefined;
  }
  return value;
}

/**
 * Read `retryAfterS` from a 429 JSON body.
 * Accepts `{error:{code:"RATE_LIMITED", retryAfterS}}`, the same envelope
 * with extra fields, or a body that only has `retryAfterS` (top-level or
 * under `error`). Unparseable / missing values return `undefined`.
 */
export function parseRetryAfterS(payload: unknown): number | undefined {
  const rateLimit = RateLimitError.safeParse(payload);
  if (rateLimit.success) {
    return rateLimit.data.error.retryAfterS;
  }

  if (payload === null || typeof payload !== 'object') {
    return undefined;
  }

  const record = payload as Record<string, unknown>;
  const topLevel = asNonNegativeNumber(record.retryAfterS);
  if (topLevel !== undefined) {
    return topLevel;
  }

  const error = record.error;
  if (error !== null && typeof error === 'object') {
    return asNonNegativeNumber((error as Record<string, unknown>).retryAfterS);
  }

  return undefined;
}

/**
 * Parse a CORS-readable `Retry-After` header (delta-seconds or HTTP-date).
 * Returns whole seconds, or `undefined` when the header is missing/unreadable.
 */
export function parseRetryAfterHeader(
  value: string | null | undefined,
  nowMs: number
): number | undefined {
  if (value === null || value === undefined) {
    return undefined;
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return undefined;
  }
  if (/^\d+$/.test(trimmed)) {
    return asNonNegativeNumber(Number(trimmed));
  }
  const dateMs = Date.parse(trimmed);
  if (!Number.isFinite(dateMs)) {
    return undefined;
  }
  return Math.max(0, Math.ceil((dateMs - nowMs) / 1000));
}

/** Absolute time (ms) until which live POSTs should be skipped. */
export function cooldownUntilMs(nowMs: number, retryAfterS: number): number {
  return nowMs + retryAfterS * 1000;
}

/**
 * Remaining whole seconds of an in-memory cooldown, or `undefined` if it
 * has expired / was never set. Uses ceil so a later request does not hit
 * the network a few milliseconds early.
 */
export function remainingRetryAfterS(
  nowMs: number,
  untilMs: number | undefined
): number | undefined {
  if (untilMs === undefined) {
    return undefined;
  }
  const remainingMs = untilMs - nowMs;
  if (remainingMs <= 0) {
    return undefined;
  }
  return Math.ceil(remainingMs / 1000);
}
