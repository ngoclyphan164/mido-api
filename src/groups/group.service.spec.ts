import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import type { GroupRepository } from './group.repository';
import { GroupService } from './group.service';

describe('GroupService management', () => {
  it('trả group sau khi owner/admin cập nhật', async () => {
    const group = { id: 'group-id', name: 'Tên mới' };
    const repository = {
      update: vi.fn().mockResolvedValue({ kind: 'ok', group }),
    };
    const service = new GroupService(repository as unknown as GroupRepository);

    await expect(service.update('group-id', 'user-id', 'Tên mới')).resolves.toBe(group);
  });

  it('chặn member sửa và admin xóa nhóm', async () => {
    const updateRepository = {
      update: vi.fn().mockResolvedValue({ kind: 'forbidden' }),
    };
    const deleteRepository = {
      remove: vi.fn().mockResolvedValue({ kind: 'forbidden' }),
    };

    await expect(
      new GroupService(updateRepository as unknown as GroupRepository).update(
        'group-id',
        'user-id',
        'Tên mới',
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      new GroupService(deleteRepository as unknown as GroupRepository).remove(
        'group-id',
        'user-id',
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('ẩn nhóm không tồn tại hoặc caller không phải thành viên bằng 404', async () => {
    const repository = {
      remove: vi.fn().mockResolvedValue({ kind: 'not_found' }),
    };
    const service = new GroupService(repository as unknown as GroupRepository);

    await expect(service.remove('group-id', 'user-id')).rejects.toBeInstanceOf(NotFoundException);
  });
});
