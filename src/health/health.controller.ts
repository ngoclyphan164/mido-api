import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

import { Public } from '../common/decorators/public.decorator';
import { HealthService } from './health.service';

@ApiTags('health')
@Controller()
@Public()
export class HealthController {
  constructor(private readonly health: HealthService) {}

  @Get('health')
  @ApiOperation({ summary: 'Liveness check — dùng cho uptime monitor và smoke test sau deploy' })
  check() {
    return this.health.snapshot();
  }
}
