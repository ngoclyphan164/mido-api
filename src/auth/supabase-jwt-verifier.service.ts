import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { RemoteJWKSet } from 'jose' with { 'resolution-mode': 'import' };
import { z } from 'zod';

import type { AccessTokenVerifier, AuthUser } from './auth.types';

const supabaseClaimsSchema = z.object({
  sub: z.string().uuid(),
  role: z.literal('authenticated'),
  session_id: z.string().uuid().optional(),
  email: z.string().email().optional(),
  phone: z.string().optional(),
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
