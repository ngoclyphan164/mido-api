import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';

import { AuthModule } from './auth/auth.module';
import { clientIpFromHeaders } from './common/throttler/client-ip';
import { ConfigModule } from './config/config.module';
import { CronModule } from './cron/cron.module';
import { DatabaseModule } from './database/database.module';
import { FairnessModule } from './fairness/fairness.module';
import { GroupModule } from './groups/group.module';
import { HangoutModule } from './hangouts/hangout.module';
import { HealthModule } from './health/health.module';
import { InviteModule } from './invites/invite.module';
import { MidpointModule } from './midpoint/midpoint.module';
import { PlacesModule } from './places/places.module';
import { ProfileModule } from './profiles/profile.module';
import { SavedLocationModule } from './saved-locations/saved-location.module';
import { SuggestionModule } from './suggestions/suggestion.module';
import { PickModule } from './picks/pick.module';

@Module({
  imports: [
    ConfigModule,
    DatabaseModule,
    AuthModule,
    // Places/Routes API tính tiền theo request nên rate limit là hàng rào chi phí, không chỉ là bảo mật.
    // getTracker phải tự đọc header của Vercel: mặc định của guard là req.ip, mà trên Vercel đó là
    // proxy nội bộ nên mọi người gọi sẽ dùng chung một bucket duy nhất. Xem common/throttler/client-ip.ts.
    // Storage của throttler nằm trong tiến trình và Vercel chạy nhiều instance, nên giới hạn thực tế
    // là (số instance × limit) — đây là gờ giảm tốc, không phải bức tường.
    ThrottlerModule.forRoot({
      throttlers: [{ ttl: 60_000, limit: 120 }],
      getTracker: (req: Record<string, unknown>) =>
        clientIpFromHeaders((req.headers as Record<string, unknown>) ?? {}) ??
        (typeof req.ip === 'string' ? req.ip : 'unknown'),
    }),
    HealthModule,
    GroupModule,
    InviteModule,
    HangoutModule,
    MidpointModule,
    PlacesModule,
    ProfileModule,
    SavedLocationModule,
    SuggestionModule,
    PickModule,
    FairnessModule,
    CronModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
