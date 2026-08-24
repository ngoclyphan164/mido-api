import { Global, Module } from '@nestjs/common';

import { DatabaseService } from './database.service';
import { CacheMaintenanceService } from './cache-maintenance.service';

@Global()
@Module({
  providers: [DatabaseService, CacheMaintenanceService],
  exports: [DatabaseService, CacheMaintenanceService],
})
export class DatabaseModule {}
