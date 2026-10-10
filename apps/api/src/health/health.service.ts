import { Inject, Injectable, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { isLlmConfigured, type Env } from '../config/env';
import {
  LLM_DAILY_USAGE,
  type LlmDailyUsage,
  type LlmToday,
} from '../director/daily-usage';
import {
  LLM_QUOTA_BREAKER,
  type LlmQuotaBreaker,
} from '../director/quota-breaker';
import { PrismaService } from '../prisma/prisma.service';

export type LlmHealth = 'up' | 'quota-cooldown' | 'disabled';

export interface HealthResponse {
  status: 'ok';
  version: string;
  db: 'up' | 'down' | 'disabled';
  llm: LlmHealth;
  llmToday: LlmToday;
  /** ISO 8601 UTC timestamp. */
  time: string;
}

@Injectable()
export class HealthService {
  constructor(
    @Inject(ConfigService) private readonly config: ConfigService<Env, true>,
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Optional()
    @Inject(LLM_QUOTA_BREAKER)
    private readonly quotaBreaker?: LlmQuotaBreaker,
    @Optional()
    @Inject(LLM_DAILY_USAGE)
    private readonly dailyUsage?: LlmDailyUsage
  ) {}

  async getHealth(): Promise<HealthResponse> {
    const env = {
      GOOGLE_API_KEY: this.config.get('GOOGLE_API_KEY', { infer: true }),
    };
    const snap = await this.dailySnapshot();

    return {
      status: 'ok',
      version: this.config.get('GIT_SHA', { infer: true }),
      db: await this.prisma.dbHealth(),
      llm: this.llmHealth(env, snap),
      llmToday: { used: snap.used, max: snap.max },
      time: new Date().toISOString(),
    };
  }

  private async dailySnapshot(): Promise<{
    used: number;
    max: number;
    failClosed: boolean;
  }> {
    if (this.dailyUsage !== undefined) {
      return this.dailyUsage.snapshot();
    }
    return {
      used: 0,
      max: this.config.get('LLM_DAILY_MAX', { infer: true }),
      failClosed: false,
    };
  }

  private llmHealth(
    env: Pick<Env, 'GOOGLE_API_KEY'>,
    snap: { used: number; max: number; failClosed: boolean }
  ): LlmHealth {
    if (!isLlmConfigured(env)) {
      return 'disabled';
    }
    if (this.quotaBreaker?.isOpen()) {
      return 'quota-cooldown';
    }
    if (snap.failClosed || snap.used >= snap.max) {
      return 'quota-cooldown';
    }
    return 'up';
  }
}
