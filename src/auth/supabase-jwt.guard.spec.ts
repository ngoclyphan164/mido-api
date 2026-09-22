import type { ExecutionContext } from '@nestjs/common';
import { UnauthorizedException } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { AuthenticatedRequest, AuthUser } from './auth.types';
import { SupabaseJwtGuard } from './supabase-jwt.guard';
import type { SupabaseJwtVerifier } from './supabase-jwt-verifier.service';

describe('SupabaseJwtGuard', () => {
  const request = { headers: {} } as AuthenticatedRequest;
  const reflector = { getAllAndOverride: vi.fn() };
  const verifier = { verify: vi.fn() };
  const context = {
    getHandler: vi.fn(),
    getClass: vi.fn(),
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
  const guard = new SupabaseJwtGuard(
    reflector as unknown as Reflector,
    verifier as unknown as SupabaseJwtVerifier,
  );

  beforeEach(() => {
    request.headers = {};
    delete request.authUser;
    reflector.getAllAndOverride.mockReset().mockReturnValue(false);
    verifier.verify.mockReset();
  });

  it('bỏ qua JWT ở route có @Public', async () => {
    reflector.getAllAndOverride.mockReturnValue(true);

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(verifier.verify).not.toHaveBeenCalled();
  });

  it('từ chối request không có Bearer token đúng format', async () => {
    request.headers.authorization = 'Basic abc';

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('attach cả anonymous user vào request bằng auth subject', async () => {
    const user: AuthUser = {
      id: '3f8f2c43-b10d-4cd0-92d8-cc40ef58a0e8',
      isAnonymous: true,
      assuranceLevel: 'aal1',
    };
    request.headers.authorization = 'Bearer signed.jwt.value';
    verifier.verify.mockResolvedValue(user);

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(verifier.verify).toHaveBeenCalledWith('signed.jwt.value');
    expect(request.authUser).toEqual(user);
  });

  it('không làm lộ lỗi JWKS/claim cho client', async () => {
    request.headers.authorization = 'Bearer invalid';
    verifier.verify.mockRejectedValue(new Error('JWKS network detail'));

    await expect(guard.canActivate(context)).rejects.toMatchObject({
      message: 'Access token is invalid or has expired',
    });
  });
});
