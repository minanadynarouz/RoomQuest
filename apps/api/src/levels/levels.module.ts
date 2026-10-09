import { Module } from '@nestjs/common';
import { DirectorModule } from '../director/director.module';
import { LevelsController } from './levels.controller';
import { LevelsService } from './levels.service';

@Module({
  imports: [DirectorModule],
  controllers: [LevelsController],
  providers: [LevelsService],
})
// eslint-disable-next-line @typescript-eslint/no-extraneous-class
export class LevelsModule {}
