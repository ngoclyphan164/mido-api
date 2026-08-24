import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';

import { Public } from '../common/decorators/public.decorator';
import { CronSecretGuard } from '../common/guards/cron-secret.guard';
import { CacheMaintenanceService } from '../database/cache-maintenance.service';

@ApiExcludeController()
@Controller('cron')
@UseGuards(CronSecretGuard)
@Public()
export class CronController {
  constructor(private readonly cacheMaintenance: CacheMaintenanceService) {}

  /**
   * Vercel Cron gọi bằng GET và gửi `Authorization: Bearer $CRON_SECRET`.
   * Nội dung dọn cache sẽ điền ở Phase 3, khi bảng places /
   * route_matrix_cache đã tồn tại.
   */
  @Get('prune-cache')
  async pruneCache() {
    const pruned = await this.cacheMaintenance.pruneExpired();
    return { pruned, total: pruned.places + pruned.routes };
  }
}
