import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
  UseGuards,
} from '@nestjs/common';
import { LevelRequest, type LevelResponse } from '@roomquest/schema';
import { RequestHeaders } from '../common/request-headers.decorator';
import { LevelHeaders } from '../common/headers.schema';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { IpThrottlerGuard } from './ip-throttler.guard';
import { LevelsService } from './levels.service';

@Controller('v1/levels')
@UseGuards(IpThrottlerGuard)
export class LevelsController {
  constructor(@Inject(LevelsService) private readonly levels: LevelsService) {}

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
}
