import { NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import type { PickRepository } from './pick.repository';
import { PickService } from './pick.service';

describe('PickService', () => {
  it('trả lựa chọn vừa ghi từ repository', async () => {
    const pick = {
      suggestionId: 'suggestion-id',
      participantId: 'participant-id',
      updatedAt: new Date('2026-09-22T13:00:00Z'),
    };
    const setPick = vi.fn().mockResolvedValue(pick);
    const service = new PickService({ setPick } as unknown as PickRepository);

    await expect(service.setPick('hangout-id', 'user-id', 'suggestion-id')).resolves.toBe(pick);
    expect(setPick).toHaveBeenCalledWith('hangout-id', 'user-id', 'suggestion-id');
  });

  it('không tiết lộ suggestion nếu user chưa phải participant', async () => {
    const service = new PickService({
      setPick: vi.fn().mockResolvedValue(undefined),
    } as unknown as PickRepository);

    await expect(
      service.setPick('hangout-id', 'outsider-id', 'suggestion-id'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('coi việc bỏ tick khi chưa chọn gì là thành công', async () => {
    const clearPick = vi.fn().mockResolvedValue(false);
    const service = new PickService({ clearPick } as unknown as PickRepository);

    await expect(service.clearPick('hangout-id', 'user-id')).resolves.toBeUndefined();
    expect(clearPick).toHaveBeenCalledWith('hangout-id', 'user-id');
  });
});
