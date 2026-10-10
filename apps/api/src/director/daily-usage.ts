import type { PrismaService } from '../prisma/prisma.service';
import type { DirectorLogger } from './telemetry';

/** Default global UTC daily cap on live Gemini calls. */
export const DEFAULT_LLM_DAILY_MAX = 150;

export const LLM_DAILY_USAGE = Symbol('LLM_DAILY_USAGE');

export type LlmDailyConsumeResult = 'ok' | 'capped' | 'unavailable';

export interface LlmToday {
  used: number;
  max: number;
}

export interface LlmDailySnapshot extends LlmToday {
  /** True when the counter cannot be read or updated (fail closed). */
  failClosed: boolean;
}

export interface LlmDailyUsageOptions {
  prisma: PrismaService;
  max?: number;
  now?: () => number;
  logger?: Pick<DirectorLogger, 'warn'>;
}

/** UTC calendar day (`YYYY-MM-DD`) for `nowMs`. */
export function utcDayKey(nowMs: number): string {
  return new Date(nowMs).toISOString().slice(0, 10);
}

function asCount(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'bigint') {
    return Number(value);
  }
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

/**
 * Process-wide UTC daily cap on live Gemini calls, persisted in Postgres.
 * Increment is a single INSERT … ON CONFLICT UPDATE … RETURNING so concurrent
 * requests cannot overshoot `max`.
 */
export class LlmDailyUsage {
  private readonly prisma: PrismaService;
  private readonly max: number;
  private readonly now: () => number;
  private readonly logger?: Pick<DirectorLogger, 'warn'>;
  private capWarnedDay: string | null = null;
  private unavailableWarned = false;

  constructor(options: LlmDailyUsageOptions) {
    this.prisma = options.prisma;
    this.max = options.max ?? DEFAULT_LLM_DAILY_MAX;
    this.now = options.now ?? (() => Date.now());
    this.logger = options.logger;
  }

  /**
   * Reserve one live Gemini slot for the current UTC day.
   * Returns `ok` only when the new count is ≤ max.
   */
  async consume(): Promise<LlmDailyConsumeResult> {
    const client = this.prisma.getClient();
    if (client === null) {
      this.warnUnavailableOnce('DATABASE_URL is unset');
      return 'unavailable';
    }

    const day = utcDayKey(this.now());
    const max = this.max;
    try {
      const rows = await client.$queryRaw<{ count: unknown }[]>`
        INSERT INTO "LlmDailyUsage" ("day", "count")
        VALUES (CAST(${day} AS DATE), 1)
        ON CONFLICT ("day") DO UPDATE
        SET "count" = "LlmDailyUsage"."count" + 1
        WHERE "LlmDailyUsage"."count" < ${max}
        RETURNING "count"
      `;
      if (rows.length === 0) {
        this.warnCapOnce(day);
        return 'capped';
      }
      return 'ok';
    } catch (error) {
      this.warnUnavailableOnce(`database unreachable: ${messageOf(error)}`);
      return 'unavailable';
    }
  }

  async snapshot(): Promise<LlmDailySnapshot> {
    const max = this.max;
    const client = this.prisma.getClient();
    if (client === null) {
      this.warnUnavailableOnce('DATABASE_URL is unset');
      return { used: 0, max, failClosed: true };
    }

    const day = utcDayKey(this.now());
    try {
      const rows = await client.$queryRaw<{ count: unknown }[]>`
        SELECT "count" FROM "LlmDailyUsage" WHERE "day" = CAST(${day} AS DATE)
      `;
      const used = rows[0] === undefined ? 0 : asCount(rows[0].count);
      return { used, max, failClosed: false };
    } catch (error) {
      this.warnUnavailableOnce(`database unreachable: ${messageOf(error)}`);
      return { used: 0, max, failClosed: true };
    }
  }

  async today(): Promise<LlmToday> {
    const { used, max } = await this.snapshot();
    return { used, max };
  }

  private warnCapOnce(day: string): void {
    if (this.capWarnedDay === day) {
      return;
    }
    this.capWarnedDay = day;
    this.logger?.warn(
      `director.llm_daily_cap reached day=${day} max=${String(this.max)}`
    );
  }

  private warnUnavailableOnce(reason: string): void {
    if (this.unavailableWarned) {
      return;
    }
    this.unavailableWarned = true;
    this.logger?.warn(
      `director.llm_daily_cap unavailable; skipping live Gemini (${reason})`
    );
  }
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : 'unknown error';
}
