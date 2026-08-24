import type { Request } from 'express';

export type AuthUser = {
  id: string;
  sessionId?: string;
  email?: string;
  phone?: string;
  isAnonymous: boolean;
  assuranceLevel?: 'aal1' | 'aal2';
};

export type AuthenticatedRequest = Request & { authUser?: AuthUser };

export interface AccessTokenVerifier {
  verify(accessToken: string): Promise<AuthUser>;
}
