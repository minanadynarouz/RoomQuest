import { Inject, Injectable, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { isLlmConfigured, type Env } from '../config/env';
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
    private readonly quotaBreaker?: LlmQuotaBreaker
  ) {}

  async getHealth(): Promise<HealthResponse> {
    const env = {
      GOOGLE_API_KEY: this.config.get('GOOGLE_API_KEY', { infer: true }),
    };

    return {
      status: 'ok',
      version: this.config.get('GIT_SHA', { infer: true }),
      db: await this.prisma.dbHealth(),
      llm: this.llmHealth(env),
      time: new Date().toISOString(),
    };
  }

  private llmHealth(env: Pick<Env, 'GOOGLE_API_KEY'>): LlmHealth {
    if (!isLlmConfigured(env)) {
      return 'disabled';
    }
    if (this.quotaBreaker?.isOpen()) {
      return 'quota-cooldown';
    }
    return 'up';
  }
}
