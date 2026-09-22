import { BadGatewayException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

const DELETE_ACCOUNT_ERROR = 'Could not delete the account right now. Please try again.';

/** Server-only wrapper around Supabase Auth Admin API. */
@Injectable()
export class SupabaseAdminService {
  private readonly deleteUserBaseUrl: string;
  private readonly serviceRoleKey: string;

  constructor(config: ConfigService) {
    const supabaseUrl = config.getOrThrow<string>('DATABASE_SUPABASE_URL');
    this.deleteUserBaseUrl = `${supabaseUrl}/auth/v1/admin/users`;
    this.serviceRoleKey = config.getOrThrow<string>('DATABASE_SUPABASE_SERVICE_ROLE_KEY');
  }

  async deleteUser(userId: string): Promise<void> {
    let response: Response;

    try {
      response = await fetch(`${this.deleteUserBaseUrl}/${encodeURIComponent(userId)}`, {
        method: 'DELETE',
        headers: {
          apikey: this.serviceRoleKey,
          Authorization: `Bearer ${this.serviceRoleKey}`,
        },
      });
    } catch {
      throw new BadGatewayException(DELETE_ACCOUNT_ERROR);
    }

    if (!response.ok) {
      throw new BadGatewayException(DELETE_ACCOUNT_ERROR);
    }
  }
}
