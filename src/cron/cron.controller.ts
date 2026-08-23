import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';

import { CronSecretGuard } from '../common/guards/cron-secret.guard';

@ApiExcludeController()
@Controller('cron')
@UseGuards(CronSecretGuard)
export class CronController {
  /**
   * Vercel Cron gọi bằng GET và gửi `Authorization: Bearer $CRON_SECRET`.
   * Nội dung dọn cache sẽ điền ở Phase 3, khi bảng places /
   * route_matrix_cache đã tồn tại.
   */
  @Get('prune-cache')
  pruneCache() {
    return { pruned: 0, note: 'Chưa có bảng cache — sẽ triển khai ở Phase 3' };
  }
}
