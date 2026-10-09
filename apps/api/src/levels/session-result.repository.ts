import { Inject, Injectable, Logger } from '@nestjs/common';
import type { ResultRequest } from '@roomquest/schema';
import { PrismaService } from '../prisma/prisma.service';
import { LevelCacheRepository } from './level-cache.repository';

export type SessionResultInsert =
  | { kind: 'stored'; id: string }
  | { kind: 'deferred' }
  | { kind: 'unknown' };

export interface SessionResultWrite extends ResultRequest {
  cacheKey: string;
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
   * Unknown cache keys (DB up, no LevelCache row) are `unknown`.
   */
  async insert(row: SessionResultWrite): Promise<SessionResultInsert> {
    await this.cache.waitForInflight(row.cacheKey);

    const client = this.prisma.getClient();
    if (client === null) {
      return { kind: 'deferred' };
    }

    try {
      const found = await client.levelCache.findUnique({
        where: { key: row.cacheKey },
        select: { key: true },
      });
      if (found === null) {
        return { kind: 'unknown' };
      }

      const created = await client.sessionResult.create({
        data: {
          cacheKey: row.cacheKey,
          deviceId: row.deviceId,
          stars: row.stars,
          gems: row.gems,
          timeMs: row.timeMs,
          completed: row.completed,
          planSource: row.planSource,
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
