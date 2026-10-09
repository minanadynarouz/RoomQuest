import { Controller, Get, Inject } from '@nestjs/common';
import { HealthService, type HealthResponse } from './health.service';

@Controller('health')
export class HealthController {
  constructor(@Inject(HealthService) private readonly health: HealthService) {}

  @Get()
  getHealth(): Promise<HealthResponse> {
    return this.health.getHealth();
  }
}
