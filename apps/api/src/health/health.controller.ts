import { Controller, Get } from '@nestjs/common';
import { SITEFOUNDRY_VERSION } from '@sitefoundry/shared';
import { HealthService } from './health.service';

@Controller('health')
export class HealthController {
  constructor(private readonly health: HealthService) {}

  @Get()
  async check() {
    const [database, redis] = await Promise.all([
      this.health.checkDatabase(),
      this.health.checkRedis(),
    ]);
    return {
      status: 'ok',
      version: SITEFOUNDRY_VERSION,
      dependencies: { database, redis },
    };
  }
}
