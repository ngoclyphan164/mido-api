import { ConflictException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import type { SavedLocationRepository } from './saved-location.repository';
import { SavedLocationService } from './saved-location.service';

function makeService(repository: Partial<SavedLocationRepository>) {
  return new SavedLocationService(repository as unknown as SavedLocationRepository);
}

const input = { label: 'Nhà', lat: 10.77, lng: 106.7 };

describe('SavedLocationService', () => {
  it('trả địa điểm vừa lưu', async () => {
    const location = { id: 'loc-1', label: 'Nhà' };
    const repository = { create: vi.fn().mockResolvedValue({ kind: 'ok', location }) };

    await expect(makeService(repository).create('user-1', input)).resolves.toBe(location);
  });

  it('báo 409 khi chạm trần và khi trùng tên', async () => {
    const full = { create: vi.fn().mockResolvedValue({ kind: 'limit_reached' }) };
    const duplicate = { create: vi.fn().mockResolvedValue({ kind: 'duplicate_label' }) };

    await expect(makeService(full).create('user-1', input)).rejects.toBeInstanceOf(
      ConflictException,
    );
    await expect(makeService(duplicate).create('user-1', input)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('báo 404 khi sửa địa điểm không thuộc về mình', async () => {
    const repository = { update: vi.fn().mockResolvedValue({ kind: 'not_found' }) };

    await expect(
      makeService(repository).update('loc-1', 'user-1', { label: 'Công ty' }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('xoá im lặng khi thành công, 404 khi không sở hữu', async () => {
    const ok = { remove: vi.fn().mockResolvedValue(true) };
    const missing = { remove: vi.fn().mockResolvedValue(false) };

    await expect(makeService(ok).remove('loc-1', 'user-1')).resolves.toBeUndefined();
    await expect(makeService(missing).remove('loc-1', 'user-1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
