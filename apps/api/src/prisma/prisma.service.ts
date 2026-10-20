import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../config/env';
import { PrismaClient } from '../generated/prisma/client';
import { createPrismaAdapter } from './create-adapter';
import { pingWithTimeout } from './ping';

export const PRISMA_PING_TIMEOUT_MS = 2_000;

export type DbHealth = 'up' | 'down' | 'disabled';

@Injectable()
export class PrismaService implements OnModuleDestroy, OnApplicationBootstrap {
  private readonly logger = new Logger(PrismaService.name);
  private readonly client: PrismaClient | null;
  /** True only when DATABASE_URL is unset — not when the URL is bad. */
  private readonly disabled: boolean;

  constructor(
    @Inject(ConfigService) private readonly config: ConfigService<Env, true>
  ) {
    const url = this.config.get('DATABASE_URL', { infer: true });
    this.disabled = url === undefined;
    this.client = url === undefined ? null : this.tryCreateClient(url);
  }

  /**
   * Runtime client, or null when DATABASE_URL is unset / client failed to
   * start. Callers must treat null as "no cache" and never throw.
   */
  getClient(): PrismaClient | null {
    return this.client;
  }

  private firstQueryClaimed = false;

  /**
   * True exactly once per process: for the caller about to run the first DB
   * query. Timing breakdowns label that query `…ColdMs` because it pays the
   * connection setup (and, on Neon free tier, a compute resume after idle).
   */
  claimFirstQuery(): boolean {
    if (this.firstQueryClaimed) return false;
    this.firstQueryClaimed = true;
    return true;
  }

  /** Boot-time connection warm-up (never in tests; never throws). */
  onApplicationBootstrap(): void {
    if (process.env.VITEST !== undefined || process.env.NODE_ENV === 'test') {
      return;
    }
    void this.warmConnection();
  }

  /**
   * `SELECT 1` so the TCP/TLS connection (and a suspended Neon compute) is
   * up before the first user request. Logs one line; never throws.
   */
  async warmConnection(now: () => number = () => Date.now()): Promise<boolean> {
    const client = this.client;
    if (client === null) return false;
    this.claimFirstQuery();
    const started = now();
    try {
      await client.$queryRawUnsafe('SELECT 1');
      this.logger.log(`prisma.warmup ok ms=${String(now() - started)}`);
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.name : 'error';
      this.logger.warn(
        `prisma.warmup failed error=${message} ms=${String(now() - started)}`
      );
      return false;
    }
  }

  /**
   * True when a client exists and `SELECT 1` succeeds within the ping budget.
   * Never throws: a missing URL, a bad URL, or an unreachable DB are all
   * reported as false so the API can boot in mock mode.
   */
  async ping(): Promise<boolean> {
    const client = this.client;
    if (client === null) {
      return false;
    }
    return pingWithTimeout(
      () => client.$queryRawUnsafe('SELECT 1'),
      PRISMA_PING_TIMEOUT_MS
    );
  }

  /**
   * Health `db` field: `"disabled"` when `DATABASE_URL` is unset, `"up"`
   * when a bounded ping succeeds, `"down"` when the URL is set but Postgres
   * is unreachable or the client failed to start.
   */
  async dbHealth(): Promise<DbHealth> {
    if (this.disabled) {
      return 'disabled';
    }
    return (await this.ping()) ? 'up' : 'down';
  }

  async onModuleDestroy(): Promise<void> {
    if (this.client !== null) {
      await this.client.$disconnect();
    }
  }

  private tryCreateClient(url: string): PrismaClient | null {
    try {
      return new PrismaClient({ adapter: createPrismaAdapter(url) });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown error';
      this.logger.warn(`Prisma client was not created: ${message}`);
      return null;
    }
  }
}
