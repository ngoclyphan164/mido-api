import { BadGatewayException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { SupabaseAdminService } from './supabase-admin.service';

describe('SupabaseAdminService', () => {
  const serviceRoleKey = 'test-service-role-key-at-least-20-chars';
  const config = {
    getOrThrow: vi.fn((key: string) =>
      key === 'DATABASE_SUPABASE_URL' ? 'https://mido.supabase.co' : serviceRoleKey,
    ),
  };

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('xóa đúng auth user bằng service role key chỉ ở server', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const service = new SupabaseAdminService(config as unknown as ConfigService);

    await service.deleteUser('3f8f2c43-b10d-4cd0-92d8-cc40ef58a0e8');

    expect(fetchMock).toHaveBeenCalledWith(
      'https://mido.supabase.co/auth/v1/admin/users/3f8f2c43-b10d-4cd0-92d8-cc40ef58a0e8',
      {
        method: 'DELETE',
        headers: {
          apikey: serviceRoleKey,
          Authorization: `Bearer ${serviceRoleKey}`,
        },
      },
    );
  });

  it('không làm lộ lỗi hoặc response Supabase cho client', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('secret upstream detail', { status: 500 })),
    );
    const service = new SupabaseAdminService(config as unknown as ConfigService);

    await expect(service.deleteUser('3f8f2c43-b10d-4cd0-92d8-cc40ef58a0e8')).rejects.toEqual(
      new BadGatewayException('Could not delete the account right now. Please try again.'),
    );
  });

  it('đổi lỗi mạng thành lỗi 502 có thể thử lại', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network secret')));
    const service = new SupabaseAdminService(config as unknown as ConfigService);

    await expect(service.deleteUser('3f8f2c43-b10d-4cd0-92d8-cc40ef58a0e8')).rejects.toBeInstanceOf(
      BadGatewayException,
    );
  });
});
