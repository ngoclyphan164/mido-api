import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { IS_PUBLIC_ROUTE } from '../common/decorators/public.decorator';
import type { AuthenticatedRequest } from './auth.types';
import { SupabaseJwtVerifier } from './supabase-jwt-verifier.service';

@Injectable()
export class SupabaseJwtGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly verifier: SupabaseJwtVerifier,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_ROUTE, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const accessToken = this.readBearerToken(request.headers.authorization);

    if (!accessToken) {
      throw new UnauthorizedException('Missing Bearer access token');
    }

    try {
      request.authUser = await this.verifier.verify(accessToken);
      return true;
    } catch {
      throw new UnauthorizedException('Access token is invalid or has expired');
    }
  }

  private readBearerToken(header: string | undefined): string | undefined {
    if (!header) return undefined;

    const match = /^Bearer ([^\s]+)$/.exec(header);
    return match?.[1];
  }
}
