import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import {
  LevelRequest,
  ResultRequest,
  type LevelResponse,
  type ResultDeferred,
  type ResultResponse,
} from '@roomquest/schema';
import { RequestHeaders } from '../common/request-headers.decorator';
import { LevelHeaders } from '../common/headers.schema';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { IpThrottlerGuard } from './ip-throttler.guard';
import { LevelsService } from './levels.service';
import { ResultsService } from './results.service';

@Controller('v1/levels')
@UseGuards(IpThrottlerGuard)
export class LevelsController {
  constructor(
    @Inject(LevelsService) private readonly levels: LevelsService,
    @Inject(ResultsService) private readonly results: ResultsService
  ) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  create(
    @RequestHeaders(new ZodValidationPipe(LevelHeaders))
    headers: LevelHeaders,
    @Body(new ZodValidationPipe(LevelRequest))
    body: LevelRequest
  ): Promise<LevelResponse> {
    return this.levels.create(body, headers['x-device-id']);
  }

  @Post(':cacheKey/result')
  async submitResult(
    @Param('cacheKey') cacheKey: string,
    @Body(new ZodValidationPipe(ResultRequest)) body: ResultRequest,
    @Res({ passthrough: true }) res: Response
  ): Promise<ResultResponse | ResultDeferred> {
    const outcome = await this.results.submit(cacheKey, body);
    if (!outcome.stored) {
      res.status(HttpStatus.ACCEPTED);
      return { stored: false };
    }
    res.status(HttpStatus.CREATED);
    return { id: outcome.id };
  }
}
