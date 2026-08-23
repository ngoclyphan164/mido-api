import { Module } from '@nestjs/common';
import { ConfigModule as NestConfigModule } from '@nestjs/config';

import { validateEnv } from './env.schema';

@Module({
  imports: [
    NestConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      // Vercel inject env qua process.env, không có file .env trên production
      envFilePath: ['.env.local', '.env'],
      validate: validateEnv,
    }),
  ],
})
export class ConfigModule {}
