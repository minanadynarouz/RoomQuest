import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  isProcLevelKey,
  type ResultRequest,
} from '@roomquest/schema';
import { PrismaService } from '../prisma/prisma.service';
import { LevelCacheRepository } from './level-cache.repository';

export type SessionResultInsert =
  | { kind: 'stored'; id: string }
  | { kind: 'deferred' }
  | { kind: 'unknown' };

export interface SessionResultWrite extends ResultRequest {
  levelKey: string;
}

@Injectable()
export class SessionResultRepository {
  private readonly logger = new Logger(SessionResultRepository.name);

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(LevelCacheRepository)
    private readonly cache: LevelCacheRepository
  ) {}

  /**
   * Insert a session result. Never throws for a missing/unreachable DB —
   * those are `deferred` so the client can treat the write as optional.
   * Unknown director cache keys (DB up, no LevelCache row) are `unknown`.
   * `proc:<seed>:<tier>` keys skip LevelCache and store `cacheKey = null`.
   */
  async insert(row: SessionResultWrite): Promise<SessionResultInsert> {
    const procedural = isProcLevelKey(row.levelKey);
    if (!procedural) {
      await this.cache.waitForInflight(row.levelKey);
    }

    const client = this.prisma.getClient();
    if (client === null) {
      return { kind: 'deferred' };
    }

    try {
      let cacheKey: string | null = null;
      if (!procedural) {
        const found = await client.levelCache.findUnique({
          where: { key: row.levelKey },
          select: { key: true },
        });
        if (found === null) {
          return { kind: 'unknown' };
        }
        cacheKey = found.key;
      }

      const created = await client.sessionResult.create({
        data: {
          levelKey: row.levelKey,
          cacheKey,
          deviceId: row.deviceId,
          stars: row.stars,
          gems: row.gems,
          timeMs: row.timeMs,
          completed: row.completed,
          planSource: row.planSource,
          relaxed: row.relaxed === undefined ? undefined : [...row.relaxed],
        },
        select: { id: true },
      });
      return { kind: 'stored', id: created.id };
    } catch (error) {
      if (isForeignKeyError(error)) {
        return { kind: 'unknown' };
      }
      this.logger.warn(
        `Session result not stored (${messageOf(error)}); returning stored:false`
      );
      return { kind: 'deferred' };
    }
  }
}

function isForeignKeyError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 'P2003'
  );
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : 'unknown error';
}
