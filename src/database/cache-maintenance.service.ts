import { Injectable } from '@nestjs/common';
import { lt } from 'drizzle-orm';

import { DatabaseService } from './database.service';
import { placeContentCache, routeMatrixCache } from './schema';

@Injectable()
export class CacheMaintenanceService {
  constructor(private readonly database: DatabaseService) {}

  async pruneExpired(now = new Date()): Promise<{ places: number; routes: number }> {
    const [places, routes] = await Promise.all([
      this.database.db
        .delete(placeContentCache)
        .where(lt(placeContentCache.expiresAt, now))
        .returning({ id: placeContentCache.id }),
      this.database.db
        .delete(routeMatrixCache)
        .where(lt(routeMatrixCache.expiresAt, now))
        .returning({ id: routeMatrixCache.id }),
    ]);

    return { places: places.length, routes: routes.length };
  }
}
