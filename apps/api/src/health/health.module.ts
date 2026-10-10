import { Module } from '@nestjs/common';
import { DirectorModule } from '../director/director.module';
import { HealthController } from './health.controller';
import { HealthService } from './health.service';

@Module({
  imports: [DirectorModule],
  controllers: [HealthController],
  providers: [HealthService],
})
// eslint-disable-next-line @typescript-eslint/no-extraneous-class
export class HealthModule {}
