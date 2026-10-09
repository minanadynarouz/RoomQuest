import { Module } from '@nestjs/common';
import { ThrottlerModule } from '@nestjs/throttler';
import { DirectorModule } from '../director/director.module';
import { CacheMissLimiter } from './cache-miss-limiter';
import { IpThrottlerGuard } from './ip-throttler.guard';
import { LevelCacheRepository } from './level-cache.repository';
import { LevelsController } from './levels.controller';
import { LevelsService } from './levels.service';
import { ResultsService } from './results.service';
import { SessionResultRepository } from './session-result.repository';
import { IP_RATE_LIMIT, IP_RATE_WINDOW_MS } from './rate-limit.constants';

@Module({
  imports: [
    DirectorModule,
    ThrottlerModule.forRoot({
      throttlers: [
        {
          name: 'default',
          ttl: IP_RATE_WINDOW_MS,
          limit: IP_RATE_LIMIT,
        },
      ],
    }),
  ],
  controllers: [LevelsController],
  providers: [
    LevelsService,
    ResultsService,
    LevelCacheRepository,
    SessionResultRepository,
    CacheMissLimiter,
    IpThrottlerGuard,
  ],
})
// eslint-disable-next-line @typescript-eslint/no-extraneous-class
export class LevelsModule {}
