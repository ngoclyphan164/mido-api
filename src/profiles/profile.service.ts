import { Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { AuthUser } from '../auth/auth.types';
import { ProfileRepository, type ProfilePatch, type ProfileView } from './profile.repository';

/** Public Supabase Storage bucket; created by migration 0012. */
export const AVATAR_BUCKET = 'avatars';

@Injectable()
export class ProfileService {
  private readonly avatarPrefix: string;

  constructor(
    private readonly repository: ProfileRepository,
    config: ConfigService,
  ) {
    const supabaseUrl = config.getOrThrow<string>('DATABASE_SUPABASE_URL').replace(/\/+$/, '');
    this.avatarPrefix = `${supabaseUrl}/storage/v1/object/public/${AVATAR_BUCKET}/`;
  }

  me(user: AuthUser): Promise<ProfileView> {
    return this.repository.findOrCreate(user.id, {
      email: user.email,
      isAnonymous: user.isAnonymous,
    });
  }

  async update(user: AuthUser, patch: ProfilePatch): Promise<ProfileView> {
    if (typeof patch.avatarUrl === 'string') this.assertOwnAvatarUrl(user.id, patch.avatarUrl);

    // Heal first so a PATCH from an account whose trigger never fired still works.
    await this.repository.findOrCreate(user.id, {
      email: user.email,
      isAnonymous: user.isAnonymous,
    });

    const updated = await this.repository.update(user.id, patch);
    if (!updated) throw new NotFoundException('Không tìm thấy hồ sơ của bạn');
    return updated;
  }

  /**
   * The client renders this URL into every screen that shows the member, so an
   * attacker-chosen host would be a tracking pixel that learns the IP of
   * everyone in their groups. Only the caller's own folder in the avatars
   * bucket is accepted — which is also exactly what the storage RLS policy lets
   * them write to, so the two checks agree.
   *
   * Lives here rather than in the DTO because the prefix comes from
   * ConfigService, while `createZodDto` schemas are built at module load.
   */
  private assertOwnAvatarUrl(userId: string, avatarUrl: string): void {
    if (!avatarUrl.startsWith(`${this.avatarPrefix}${userId}/`)) {
      throw new UnprocessableEntityException(
        'Ảnh đại diện phải được tải lên thư mục của chính bạn trong Supabase Storage',
      );
    }
  }
}
