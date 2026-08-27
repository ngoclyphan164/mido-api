import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import type { SuggestionSnapshotService } from '../suggestions/suggestion-snapshot.service';
import type { HangoutRepository } from './hangout.repository';
import { HangoutService } from './hangout.service';

/** Các test dưới đây không đi qua `detail()`, nên snapshot địa điểm không được gọi. */
const snapshots = { getChosenForHangout: vi.fn() } as unknown as SuggestionSnapshotService;

describe('HangoutService management', () => {
  it('trả hangout sau khi creator/owner/admin cập nhật', async () => {
    const hangout = { id: 'hangout-id', activityType: 'food' };
    const repository = {
      update: vi.fn().mockResolvedValue({ kind: 'ok', hangout }),
    };
    const service = new HangoutService(repository as unknown as HangoutRepository, snapshots);

    await expect(service.update('hangout-id', 'user-id', { activityType: 'food' })).resolves.toBe(
      hangout,
    );
  });

  it('chặn thành viên thường không phải creator', async () => {
    const repository = {
      update: vi.fn().mockResolvedValue({ kind: 'forbidden' }),
    };
    const service = new HangoutService(repository as unknown as HangoutRepository, snapshots);

    await expect(
      service.update('hangout-id', 'user-id', { activityType: 'food' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('không sửa/xóa kèo đã chốt để bảo vệ outing và fairness ledger', async () => {
    const updateRepository = {
      update: vi.fn().mockResolvedValue({ kind: 'immutable', status: 'decided' }),
    };
    const deleteRepository = {
      remove: vi.fn().mockResolvedValue({ kind: 'immutable', status: 'done' }),
    };

    await expect(
      new HangoutService(updateRepository as unknown as HangoutRepository, snapshots).update(
        'hangout-id',
        'user-id',
        { activityType: 'food' },
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    await expect(
      new HangoutService(deleteRepository as unknown as HangoutRepository, snapshots).remove(
        'hangout-id',
        'user-id',
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('ẩn kèo không tồn tại hoặc caller không thuộc nhóm bằng 404', async () => {
    const repository = {
      remove: vi.fn().mockResolvedValue({ kind: 'not_found' }),
    };
    const service = new HangoutService(repository as unknown as HangoutRepository, snapshots);

    await expect(service.remove('hangout-id', 'user-id')).rejects.toBeInstanceOf(NotFoundException);
  });
});
