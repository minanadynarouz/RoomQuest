import type { DirectorLogger } from './telemetry';

/** Default Gemini quota cooldown (10 minutes) when the error has no Retry-After. */
export const DEFAULT_LLM_QUOTA_COOLDOWN_S = 600;

export const LLM_QUOTA_BREAKER = Symbol('LLM_QUOTA_BREAKER');

const QUOTA_STATUS = 'RESOURCE_EXHAUSTED';
const DELAY_KEYS = new Set([
  'retrydelay',
  'retry-after',
  'retryafter',
  'retry_after',
  'retryafters',
]);
const STATUS_KEYS = ['status', 'statusCode', 'code', 'httpStatus'] as const;

export interface LlmQuotaBreakerOptions {
  defaultCooldownMs?: number;
  now?: () => number;
  logger?: Pick<DirectorLogger, 'log' | 'warn'>;
}

/**
 * Process-wide Gemini quota circuit breaker.
 * Open on HTTP 429 / RESOURCE_EXHAUSTED; while open, the director skips Gemini.
 */
export class LlmQuotaBreaker {
  private openUntilMs = 0;
  private readonly defaultCooldownMs: number;
  private readonly now: () => number;
  private readonly logger?: Pick<DirectorLogger, 'log' | 'warn'>;

  constructor(options: LlmQuotaBreakerOptions = {}) {
    this.defaultCooldownMs =
      options.defaultCooldownMs ?? DEFAULT_LLM_QUOTA_COOLDOWN_S * 1000;
    this.now = options.now ?? (() => Date.now());
    this.logger = options.logger;
  }

  isOpen(): boolean {
    if (this.openUntilMs === 0) {
      return false;
    }
    if (this.now() >= this.openUntilMs) {
      this.close();
      return false;
    }
    return true;
  }

  trip(err: unknown): void {
    this.isOpen();
    const cooldownMs = quotaCooldownMs(err, this.defaultCooldownMs);
    const untilMs = this.now() + cooldownMs;
    const wasOpen = this.openUntilMs > this.now();
    if (untilMs > this.openUntilMs) {
      this.openUntilMs = untilMs;
    }
    if (!wasOpen) {
      this.logger?.warn(
        `director.quota_breaker open cooldownMs=${String(cooldownMs)}`
      );
    }
  }

  private close(): void {
    if (this.openUntilMs === 0) {
      return;
    }
    this.openUntilMs = 0;
    this.logger?.log('director.quota_breaker close');
  }
}

export function isQuotaError(err: unknown): boolean {
  return findQuotaSignal(err, new Set());
}

export function quotaCooldownMs(err: unknown, fallbackMs: number): number {
  const found = findRetryAfterMs(err, new Set());
  if (found === undefined || !Number.isFinite(found) || found <= 0) {
    return fallbackMs;
  }
  return found;
}

function findQuotaSignal(value: unknown, seen: Set<unknown>): boolean {
  if (value === null || value === undefined) {
    return false;
  }
  if (typeof value === 'string') {
    return stringLooksLikeQuota(value);
  }
  if (typeof value !== 'object') {
    return false;
  }
  if (seen.has(value)) {
    return false;
  }
  seen.add(value);
  const rec = value as Record<string, unknown>;
  for (const key of STATUS_KEYS) {
    if (isQuotaStatus(rec[key])) {
      return true;
    }
  }
  if (typeof rec.message === 'string' && stringLooksLikeQuota(rec.message)) {
    return true;
  }
  for (const nested of [rec.error, rec.response, rec.cause, rec.data]) {
    if (findQuotaSignal(nested, seen)) {
      return true;
    }
  }
  return false;
}

function isQuotaStatus(value: unknown): boolean {
  return value === 429 || value === '429' || value === QUOTA_STATUS;
}

function stringLooksLikeQuota(value: string): boolean {
  if (value.includes(QUOTA_STATUS)) {
    return true;
  }
  return /\[429\b/.test(value) || /429 Too Many Requests/i.test(value);
}

function findRetryAfterMs(
  value: unknown,
  seen: Set<unknown>
): number | undefined {
  if (value === null || value === undefined) {
    return undefined;
  }
  if (typeof value !== 'object') {
    return undefined;
  }
  if (seen.has(value)) {
    return undefined;
  }
  seen.add(value);

  if (isHeadersLike(value)) {
    const header = headerValue(value, 'retry-after');
    const fromHeader = parseDelayMs(header);
    if (fromHeader !== undefined) {
      return fromHeader;
    }
  }

  const rec = value as Record<string, unknown>;
  for (const [key, child] of Object.entries(rec)) {
    if (DELAY_KEYS.has(key.toLowerCase())) {
      const parsed = parseDelayMs(child) ?? findRetryAfterMs(child, seen);
      if (parsed !== undefined) {
        return parsed;
      }
    }
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findRetryAfterMs(item, seen);
      if (found !== undefined) {
        return found;
      }
    }
    return undefined;
  }
  for (const child of Object.values(rec)) {
    const found = findRetryAfterMs(child, seen);
    if (found !== undefined) {
      return found;
    }
  }
  return undefined;
}

function parseDelayMs(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return value * 1000;
  }
  if (typeof value === 'object' && value !== null && 'seconds' in value) {
    const seconds = Number(value.seconds);
    const nanos = Number('nanos' in value ? value.nanos : 0);
    if (Number.isFinite(seconds) && seconds >= 0) {
      const ms = seconds * 1000 + (Number.isFinite(nanos) ? nanos / 1e6 : 0);
      return ms > 0 ? ms : undefined;
    }
    return undefined;
  }
  if (typeof value !== 'string') {
    return undefined;
  }
  const trimmed = value.trim();
  const duration = /^(\d+(?:\.\d+)?)s$/i.exec(trimmed);
  if (duration !== null) {
    const ms = Number(duration[1]) * 1000;
    return ms > 0 ? ms : undefined;
  }
  const asNum = Number(trimmed);
  if (Number.isFinite(asNum) && asNum > 0) {
    return asNum * 1000;
  }
  return undefined;
}

function isHeadersLike(
  value: object
): value is { get: (name: string) => string | null } {
  return 'get' in value && typeof (value as { get?: unknown }).get === 'function';
}

function headerValue(
  headers: { get: (name: string) => string | null },
  name: string
): string | null {
  try {
    return headers.get(name);
  } catch {
    return null;
  }
}
