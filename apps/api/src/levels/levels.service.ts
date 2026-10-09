import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SYNTHETIC_LIVING_ROOM_PLAN } from '@roomquest/fixtures';
import { LevelPlan, LevelResponse, type LevelRequest } from '@roomquest/schema';
import { PROMPT_VERSION } from '../common/constants';
import type { Env } from '../config/env';
import { makeCacheKey } from './cache-key';

@Injectable()
export class LevelsService {
  private readonly logger = new Logger(LevelsService.name);

  constructor(
    @Inject(ConfigService) private readonly config: ConfigService<Env, true>
  ) {}

  create(request: LevelRequest, deviceId: string): LevelResponse {
    const started = Date.now();
    const mode = this.config.get('DIRECTOR_MODE', { infer: true });
    this.logger.debug(`Level request from device ${deviceId} (mode=${mode})`);

    if (mode === 'live') {
      this.logger.warn(
        'DIRECTOR_MODE=live is not implemented yet (B-05); serving the mock fixture plan'
      );
    }

    // Mock director: always the synthetic living-room plan. Surface ids in
    // that fixture are s1/s2/s4/… and will not match an arbitrary request
    // graph. Clients must re-validate with level-core (architecture §6).
    const plan = LevelPlan.parse(SYNTHETIC_LIVING_ROOM_PLAN);
    const cacheKey = makeCacheKey(
      request.graph.roomHash,
      request.date,
      request.tier,
      PROMPT_VERSION
    );

    return LevelResponse.parse({
      plan,
      source: 'procedural',
      cacheKey,
      promptVersion: PROMPT_VERSION,
      latencyMs: Date.now() - started,
      repairs: [],
    });
  }
}
