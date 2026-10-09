import { Inject, Injectable, Logger } from '@nestjs/common';
import type { LevelRequest, LevelResponse } from '@roomquest/schema';
import { DirectorService } from '../director/director.service';

@Injectable()
export class LevelsService {
  private readonly logger = new Logger(LevelsService.name);

  constructor(
    @Inject(DirectorService) private readonly director: DirectorService
  ) {}

  async create(request: LevelRequest, deviceId: string): Promise<LevelResponse> {
    this.logger.debug(`Level request from device ${deviceId}`);
    return this.director.plan(request);
  }
}
