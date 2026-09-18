import type { ConfigService } from '@nestjs/config';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { SupabaseJwtVerifier } from './supabase-jwt-verifier.service';

/** Payload mà `jose` trả về sau khi đã kiểm chữ ký — phần này test không quan tâm. */
const jwtVerify = vi.fn<() => Promise<{ payload: Record<string, unknown> }>>();

vi.mock('jose', () => ({
  createRemoteJWKSet: vi.fn(() => 'jwks'),
  jwtVerify: () => jwtVerify(),
}));

const config = {
  getOrThrow: () => 'https://project.supabase.co',
} as unknown as ConfigService;

/** Claim tối thiểu của một access token Supabase hợp lệ. */
const baseClaims = {
  sub: '11111111-1111-4111-8111-111111111111',
  role: 'authenticated',
  session_id: '22222222-2222-4222-8222-222222222222',
};

describe('SupabaseJwtVerifier', () => {
  let verifier: SupabaseJwtVerifier;

  beforeEach(() => {
    jwtVerify.mockReset();
    verifier = new SupabaseJwtVerifier(config);
  });

  it('đọc được token của người dùng đã đăng ký', async () => {
    jwtVerify.mockResolvedValue({
      payload: { ...baseClaims, email: 'ai@example.com', is_anonymous: false },
    });

    await expect(verifier.verify('token')).resolves.toMatchObject({
      id: baseClaims.sub,
      email: 'ai@example.com',
      isAnonymous: false,
    });
  });

  /**
   * Đây là hình dạng token mà `signInAnonymously` thật sự phát ra: `email` và
   * `phone` là chuỗi rỗng chứ không vắng mặt. Trước khi có `blankToUndefined`,
   * trường hợp này ném ngay tại `.parse` và mọi endpoint trả 401 cho khách —
   * trong khi README mô tả guest là tính năng đã chạy.
   */
  it('đọc được token khách, nơi email và phone là chuỗi rỗng', async () => {
    jwtVerify.mockResolvedValue({
      payload: { ...baseClaims, email: '', phone: '', is_anonymous: true },
    });

    await expect(verifier.verify('token')).resolves.toEqual({
      id: baseClaims.sub,
      sessionId: baseClaims.session_id,
      email: undefined,
      phone: undefined,
      isAnonymous: true,
      assuranceLevel: undefined,
    });
  });

  it('mặc định is_anonymous là false khi claim vắng mặt', async () => {
    jwtVerify.mockResolvedValue({ payload: { ...baseClaims } });

    await expect(verifier.verify('token')).resolves.toMatchObject({ isAnonymous: false });
  });

  it('từ chối token có email sai định dạng', async () => {
    jwtVerify.mockResolvedValue({ payload: { ...baseClaims, email: 'không-phải-email' } });

    await expect(verifier.verify('token')).rejects.toThrow();
  });

  it('từ chối token không mang role authenticated', async () => {
    jwtVerify.mockResolvedValue({ payload: { ...baseClaims, role: 'service_role' } });

    await expect(verifier.verify('token')).rejects.toThrow();
  });
});
