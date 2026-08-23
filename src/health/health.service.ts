import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export type HealthSnapshot = {
  status: 'ok';
  service: string;
  env: string;
  version: string;
  /** Giây kể từ khi function instance này khởi động — hữu ích để nhận biết cold start. */
  uptimeSeconds: number;
  timestamp: string;
};

@Injectable()
export class HealthService {
  constructor(private readonly config: ConfigService) {}

  snapshot(): HealthSnapshot {
    return {
      status: 'ok',
      service: 'mido-api',
      env: this.config.get<string>('NODE_ENV') ?? 'unknown',
      version: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? 'local',
      uptimeSeconds: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
    };
  }
}
