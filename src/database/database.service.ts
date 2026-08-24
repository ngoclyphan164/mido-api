import { Injectable, type OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres, { type Sql } from 'postgres';

import * as schema from './schema';

@Injectable()
export class DatabaseService implements OnApplicationShutdown {
  readonly client: Sql;
  readonly db: PostgresJsDatabase<typeof schema>;

  constructor(config: ConfigService) {
    const connectionString = config.getOrThrow<string>('DATABASE_POSTGRES_URL');
    const max = config.get<number>('DATABASE_POOL_SIZE') ?? 3;

    this.client = postgres(connectionString, {
      prepare: false,
      max,
      idle_timeout: 20,
      connect_timeout: 10,
    });
    this.db = drizzle(this.client, { schema });
  }

  async onApplicationShutdown(): Promise<void> {
    await this.client.end({ timeout: 5 });
  }
}
