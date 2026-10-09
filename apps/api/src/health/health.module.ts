import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { HealthService } from './health.service';

@Module({
  controllers: [HealthController],
  providers: [HealthService],
})
// eslint-disable-next-line @typescript-eslint/no-extraneous-class
export class HealthModule {}
