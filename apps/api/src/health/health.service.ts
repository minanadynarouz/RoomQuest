import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { isLlmConfigured, type Env } from '../config/env';
import { PrismaService } from '../prisma/prisma.service';

export interface HealthResponse {
  status: 'ok';
  version: string;
  db: 'ok' | 'down';
  llm: 'configured' | 'missing';
  /** ISO 8601 UTC timestamp. */
  time: string;
}

@Injectable()
export class HealthService {
  constructor(
    @Inject(ConfigService) private readonly config: ConfigService<Env, true>,
    @Inject(PrismaService) private readonly prisma: PrismaService
  ) {}

  async getHealth(): Promise<HealthResponse> {
    const env = {
      GOOGLE_API_KEY: this.config.get('GOOGLE_API_KEY', { infer: true }),
      ANTHROPIC_API_KEY: this.config.get('ANTHROPIC_API_KEY', { infer: true }),
    };

    return {
      status: 'ok',
      version: this.config.get('GIT_SHA', { infer: true }),
      db: (await this.prisma.ping()) ? 'ok' : 'down',
      llm: isLlmConfigured(env) ? 'configured' : 'missing',
      time: new Date().toISOString(),
    };
  }
}
