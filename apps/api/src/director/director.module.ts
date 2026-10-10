import { Logger, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../config/env';
import { DirectorService } from './director.service';
import {
  defaultDirectorChatFactory,
  DIRECTOR_CHAT_FACTORY,
  DIRECTOR_RUNTIME,
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
    DirectorService,
  ],
  exports: [
    DirectorService,
    DIRECTOR_CHAT_FACTORY,
    DIRECTOR_RUNTIME,
    LLM_QUOTA_BREAKER,
  ],
})
// eslint-disable-next-line @typescript-eslint/no-extraneous-class
export class DirectorModule {}
