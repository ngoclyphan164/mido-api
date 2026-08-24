import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_ROUTE = 'isPublicRoute';

/** Route không yêu cầu Supabase access token. Authorization riêng vẫn có thể áp dụng. */
export const Public = () => SetMetadata(IS_PUBLIC_ROUTE, true);
