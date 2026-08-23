import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

import { HealthService } from './health.service';

@ApiTags('health')
@Controller()
export class HealthController {
  constructor(private readonly health: HealthService) {}

  @Get('health')
  @ApiOperation({ summary: 'Liveness check — dùng cho uptime monitor và smoke test sau deploy' })
  check() {
    return this.health.snapshot();
  }
}
