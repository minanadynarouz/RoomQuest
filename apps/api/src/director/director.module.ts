import { Logger, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../config/env';
import { PrismaService } from '../prisma/prisma.service';
import { LLM_DAILY_USAGE, LlmDailyUsage } from './daily-usage';
import { DirectorService } from './director.service';
import {
  defaultDirectorChatFactory,
  DIRECTOR_CHAT_FACTORY,
  DIRECTOR_RUNTIME,
  type DirectorRuntime,
} from './models';
import { LLM_QUOTA_BREAKER, LlmQuotaBreaker } from './quota-breaker';

@Module({
  providers: [
    {
      provide: DIRECTOR_CHAT_FACTORY,
      useValue: defaultDirectorChatFactory,
    },
    {
      provide: DIRECTOR_RUNTIME,
      useValue: {},
    },
    {
      provide: LLM_QUOTA_BREAKER,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>): LlmQuotaBreaker =>
        new LlmQuotaBreaker({
          defaultCooldownMs:
            config.get('LLM_QUOTA_COOLDOWN_S', { infer: true }) * 1000,
          logger: new Logger('LlmQuotaBreaker'),
        }),
    },
    {
      provide: LLM_DAILY_USAGE,
      inject: [PrismaService, ConfigService, DIRECTOR_RUNTIME],
      useFactory: (
        prisma: PrismaService,
        config: ConfigService<Env, true>,
        runtime: DirectorRuntime
      ): LlmDailyUsage =>
        new LlmDailyUsage({
          prisma,
          max: config.get('LLM_DAILY_MAX', { infer: true }),
          now: () => runtime.now?.() ?? Date.now(),
          logger: new Logger('LlmDailyUsage'),
        }),
    },
    DirectorService,
  ],
  exports: [
    DirectorService,
    DIRECTOR_CHAT_FACTORY,
    DIRECTOR_RUNTIME,
    LLM_QUOTA_BREAKER,
    LLM_DAILY_USAGE,
  ],
})
// eslint-disable-next-line @typescript-eslint/no-extraneous-class
export class DirectorModule {}
