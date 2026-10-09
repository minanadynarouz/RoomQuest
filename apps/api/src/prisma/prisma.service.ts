import {
  Inject,
  Injectable,
  Logger,
  type OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../config/env';
import { PrismaClient } from '../generated/prisma/client';
import { createPrismaAdapter } from './create-adapter';

export const PRISMA_PING_TIMEOUT_MS = 2_000;

@Injectable()
export class PrismaService implements OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);
  private readonly client: PrismaClient | null;

  constructor(
    @Inject(ConfigService) private readonly config: ConfigService<Env, true>
  ) {
    const url = this.config.get('DATABASE_URL', { infer: true });
    this.client = url === undefined ? null : this.tryCreateClient(url);
  }

  /**
   * Runtime client, or null when DATABASE_URL is unset / client failed to
   * start. Callers must treat null as "no cache" and never throw.
   */
  getClient(): PrismaClient | null {
    return this.client;
  }

  /**
   * True when a client exists and `SELECT 1` succeeds within the ping budget.
   * Never throws: a missing URL, a bad URL, or an unreachable DB are all
   * reported as down so the API can boot in mock mode.
   */
  async ping(): Promise<boolean> {
    if (this.client === null) {
      return false;
    }
    let handle: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        this.client.$queryRawUnsafe('SELECT 1'),
        new Promise<never>((_, reject) => {
          handle = setTimeout(() => {
            reject(
              new Error(
                `Prisma ping timed out after ${String(PRISMA_PING_TIMEOUT_MS)}ms`
              )
            );
          }, PRISMA_PING_TIMEOUT_MS);
        }),
      ]);
      return true;
    } catch {
      return false;
    } finally {
      if (handle !== undefined) {
        clearTimeout(handle);
      }
    }
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
