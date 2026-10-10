import { Inject, Injectable, Logger } from '@nestjs/common';
import { DIRECTOR_BUDGET_MS } from '../director/director.constants';
import type { Prisma, PrismaClient } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CACHE_WRITE_MAX_WAIT_MS } from './rate-limit.constants';

export interface LevelCacheRow {
  key: string;
  roomHash: string;
  date: string;
  tier: string;
  promptVersion: string;
  plan: unknown;
  source: string;
  model: string | null;
  metadata: unknown;
}

export type LevelCacheWrite = LevelCacheRow;

@Injectable()
export class LevelCacheRepository {
  private readonly logger = new Logger(LevelCacheRepository.name);
  private warned = false;
  private readonly inflight = new Map<string, Promise<void>>();

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService
  ) {}

  /**
   * Returns the cached row, or null on miss / no DB / unreachable DB.
   * Waits for an in-flight upsert of the same key so a follow-up request
   * in the same process can hit.
   */
  async lookup(key: string): Promise<LevelCacheRow | null> {
    await this.waitForInflight(key);

    const client = this.prisma.getClient();
    if (client === null) {
      this.warnOnce('DATABASE_URL is unset');
      return null;
    }

    try {
      const row = await client.levelCache.findUnique({ where: { key } });
      if (row === null) {
        return null;
      }
      return {
        key: row.key,
        roomHash: row.roomHash,
        date: row.date,
        tier: row.tier,
        promptVersion: row.promptVersion,
        plan: row.plan,
        source: row.source,
        model: row.model,
        metadata: row.metadata,
      };
    } catch (error) {
      this.warnOnce(`database unreachable: ${messageOf(error)}`);
      return null;
    }
  }

  /**
   * Upsert after a successful director/procedural result. Waits at most
   * `min(CACHE_WRITE_MAX_WAIT_MS, remaining budget)` so the HTTP response
   * stays inside the 7 s wall; the write keeps going if the wait elapses.
   */
  async persist(
    row: LevelCacheWrite,
    startedMs: number,
    nowMs: number = Date.now()
  ): Promise<void> {
    const client = this.prisma.getClient();
    if (client === null) {
      this.warnOnce('DATABASE_URL is unset');
      return;
    }

    const write = this.upsert(client, row);
    this.inflight.set(row.key, write);

    const remainingMs = Math.max(0, DIRECTOR_BUDGET_MS - (nowMs - startedMs));
    const waitMs = Math.min(CACHE_WRITE_MAX_WAIT_MS, Math.max(0, remainingMs - 20));
    if (waitMs === 0) {
      return;
    }
    await Promise.race([write, sleep(waitMs)]);
  }

  private async upsert(
    client: PrismaClient,
    row: LevelCacheWrite
  ): Promise<void> {
    try {
      const plan = row.plan as Prisma.InputJsonValue;
      const metadata = row.metadata as Prisma.InputJsonValue;
      const data = {
        roomHash: row.roomHash,
        date: row.date,
        tier: row.tier,
        promptVersion: row.promptVersion,
        plan,
        source: row.source,
        model: row.model,
        metadata,
      };
      await client.levelCache.upsert({
        where: { key: row.key },
        create: { key: row.key, ...data },
        update: data,
      });
    } catch (error) {
      this.warnOnce(`database unreachable: ${messageOf(error)}`);
    } finally {
      if (this.inflight.get(row.key) !== undefined) {
        this.inflight.delete(row.key);
      }
    }
  }

  /**
   * Wait for an in-flight upsert of `key` so a follow-up `/result` in the
   * same process can see the row before the HTTP write wait elapses.
   */
  async waitForInflight(key: string): Promise<void> {
    const pending = this.inflight.get(key);
    if (pending !== undefined) {
      await pending;
    }
  }

  private warnOnce(reason: string): void {
    if (this.warned) {
      return;
    }
    this.warned = true;
    this.logger.warn(
      `Level cache unavailable (${reason}); POST /api/v1/levels still serves director/procedural plans`
    );
  }
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : 'unknown error';
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
