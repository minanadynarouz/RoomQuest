import { Module } from '@nestjs/common';
import { LevelsController } from './levels.controller';
import { LevelsService } from './levels.service';

@Module({
  controllers: [LevelsController],
  providers: [LevelsService],
})
// eslint-disable-next-line @typescript-eslint/no-extraneous-class
export class LevelsModule {}
