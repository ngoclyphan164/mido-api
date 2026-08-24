import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';

import { AuthModule } from './auth/auth.module';
import { ConfigModule } from './config/config.module';
import { CronModule } from './cron/cron.module';
import { DatabaseModule } from './database/database.module';
import { FairnessModule } from './fairness/fairness.module';
import { GroupModule } from './groups/group.module';
import { HangoutModule } from './hangouts/hangout.module';
import { HealthModule } from './health/health.module';
import { MidpointModule } from './midpoint/midpoint.module';
import { SuggestionModule } from './suggestions/suggestion.module';
import { VoteModule } from './votes/vote.module';

@Module({
  imports: [
    ConfigModule,
    DatabaseModule,
    AuthModule,
    // Places/Routes API tính tiền theo request nên rate limit là hàng rào chi phí, không chỉ là bảo mật
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 120 }]),
    HealthModule,
    GroupModule,
    HangoutModule,
    MidpointModule,
    SuggestionModule,
    VoteModule,
    FairnessModule,
    CronModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
