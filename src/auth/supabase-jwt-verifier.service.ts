import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { RemoteJWKSet } from 'jose' with { 'resolution-mode': 'import' };
import { z } from 'zod';

import type { AccessTokenVerifier, AuthUser } from './auth.types';

/**
 * Supabase phát token cho anonymous user với `email` và `phone` là CHUỖI RỖNG,
 * không phải thiếu trường.
 *
 * `''` không phải `undefined` nên `.optional()` không bỏ qua nó, mà `''` thì
 * trượt `.email()` — schema ném, guard đổi thành 401, và MỌI request của khách
 * hỏng trong khi tài khoản email vẫn chạy bình thường. Triệu chứng không hề chỉ
 * về phía claim nào, nên quy chuỗi rỗng về `undefined` ngay tại đây.
 */
const blankToUndefined = (value: unknown) => (value === '' ? undefined : value);

const supabaseClaimsSchema = z.object({
  sub: z.string().uuid(),
  role: z.literal('authenticated'),
  session_id: z.string().uuid().optional(),
  email: z.preprocess(blankToUndefined, z.string().email().optional()),
  phone: z.preprocess(blankToUndefined, z.string().optional()),
  is_anonymous: z.boolean().default(false),
  aal: z.enum(['aal1', 'aal2']).optional(),
});

@Injectable()
export class SupabaseJwtVerifier implements AccessTokenVerifier {
  private readonly issuer: string;
  private readonly jwksUrl: URL;
  private jwks: RemoteJWKSet | undefined;

  constructor(config: ConfigService) {
    const supabaseUrl = config.getOrThrow<string>('DATABASE_SUPABASE_URL');
    this.issuer = `${supabaseUrl}/auth/v1`;
    this.jwksUrl = new URL(`${this.issuer}/.well-known/jwks.json`);
  }

  async verify(accessToken: string): Promise<AuthUser> {
    // jose v6 là ESM-only. Dynamic import được giữ nguyên bởi module Node16,
    // tránh emit require('jose') từ Nest CommonJS.
    const { createRemoteJWKSet, jwtVerify } = await import('jose');
    this.jwks ??= createRemoteJWKSet(this.jwksUrl);
    const { payload } = await jwtVerify(accessToken, this.jwks, {
      issuer: this.issuer,
      audience: 'authenticated',
      algorithms: ['ES256', 'RS256'],
      clockTolerance: 5,
    });
    const claims = supabaseClaimsSchema.parse(payload);

    return {
      id: claims.sub,
      sessionId: claims.session_id,
      email: claims.email,
      phone: claims.phone,
      isAnonymous: claims.is_anonymous,
      assuranceLevel: claims.aal,
    };
  }
}
