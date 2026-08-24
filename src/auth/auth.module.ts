import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';

import { AuthController } from './auth.controller';
import { SupabaseJwtGuard } from './supabase-jwt.guard';
import { SupabaseJwtVerifier } from './supabase-jwt-verifier.service';

@Module({
  controllers: [AuthController],
  providers: [
    SupabaseJwtVerifier,
    SupabaseJwtGuard,
    { provide: APP_GUARD, useExisting: SupabaseJwtGuard },
  ],
  exports: [SupabaseJwtVerifier],
})
export class AuthModule {}
