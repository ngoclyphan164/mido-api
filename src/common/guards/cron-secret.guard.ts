import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';

/**
 * Vercel Cron gọi route qua HTTP công khai, nên route cron phải tự bảo vệ.
 * Vercel gửi `Authorization: Bearer <CRON_SECRET>` khi biến này được set.
 */
@Injectable()
export class CronSecretGuard implements CanActivate {
  private readonly logger = new Logger(CronSecretGuard.name);

  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const secret = this.config.get<string>('CRON_SECRET');

    if (!secret) {
      this.logger.error('CRON_SECRET chưa được cấu hình — chặn mọi request cron');
      throw new UnauthorizedException('Cron chưa được cấu hình');
    }

    const header = context.switchToHttp().getRequest<Request>().headers.authorization;

    if (header !== `Bearer ${secret}`) {
      throw new UnauthorizedException('Cron secret không đúng');
    }

    return true;
  }
}
