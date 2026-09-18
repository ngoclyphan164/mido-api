import type { ConfigService } from '@nestjs/config';
import { NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import type { AuthUser } from '../auth/auth.types';
import type { ProfileRepository } from './profile.repository';
import { ProfileService } from './profile.service';

const SUPABASE_URL = 'https://mido.supabase.co';
const user: AuthUser = { id: 'user-1', email: 'linh@example.com', isAnonymous: false };

function makeService(repository: Partial<ProfileRepository>) {
  const config = { getOrThrow: vi.fn().mockReturnValue(SUPABASE_URL) };
  return new ProfileService(
    repository as unknown as ProfileRepository,
    config as unknown as ConfigService,
  );
}

describe('ProfileService', () => {
  it('trả hồ sơ, tự tạo khi trigger chưa kịp ghi', async () => {
    const profile = { id: 'user-1', displayName: 'Linh' };
    const repository = { findOrCreate: vi.fn().mockResolvedValue(profile) };

    await expect(makeService(repository).me(user)).resolves.toBe(profile);
    expect(repository.findOrCreate).toHaveBeenCalledWith('user-1', {
      email: 'linh@example.com',
      isAnonymous: false,
    });
  });

  it('nhận ảnh đại diện nằm trong thư mục của chính người dùng', async () => {
    const updated = { id: 'user-1', displayName: 'Linh' };
    const repository = {
      findOrCreate: vi.fn().mockResolvedValue(updated),
      update: vi.fn().mockResolvedValue(updated),
    };

    await expect(
      makeService(repository).update(user, {
        avatarUrl: `${SUPABASE_URL}/storage/v1/object/public/avatars/user-1/avatar.jpg`,
      }),
    ).resolves.toBe(updated);
  });

  it('từ chối ảnh đại diện trỏ ra host khác hoặc thư mục người khác', async () => {
    const repository = {
      findOrCreate: vi.fn(),
      update: vi.fn(),
    };
    const service = makeService(repository);

    await expect(
      service.update(user, { avatarUrl: 'https://tracker.example.com/pixel.png' }),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
    await expect(
      service.update(user, {
        avatarUrl: `${SUPABASE_URL}/storage/v1/object/public/avatars/user-2/avatar.jpg`,
      }),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);

    // Không được chạm tới database khi URL đã sai.
    expect(repository.update).not.toHaveBeenCalled();
  });

  it('cho phép null để xoá ảnh đại diện', async () => {
    const updated = { id: 'user-1', avatarUrl: null };
    const repository = {
      findOrCreate: vi.fn().mockResolvedValue(updated),
      update: vi.fn().mockResolvedValue(updated),
    };

    await expect(makeService(repository).update(user, { avatarUrl: null })).resolves.toBe(updated);
  });

  it('báo 404 khi hồ sơ biến mất giữa chừng', async () => {
    const repository = {
      findOrCreate: vi.fn().mockResolvedValue({ id: 'user-1' }),
      update: vi.fn().mockResolvedValue(undefined),
    };

    await expect(
      makeService(repository).update(user, { displayName: 'Linh mới' }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
