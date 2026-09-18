import { GoneException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import type { InviteRepository } from './invite.repository';
import { InviteService } from './invite.service';

describe('InviteService', () => {
  it('trả đúng ba trường của lời mời còn hiệu lực', async () => {
    const preview = {
      groupName: 'Team Cà Phê',
      memberCount: 4,
      inviteExpiresAt: new Date('2026-09-20T10:00:00Z'),
    };
    const repository = { preview: vi.fn().mockResolvedValue({ kind: 'ok', preview }) };

    await expect(
      new InviteService(repository as unknown as InviteRepository).preview('8F2K9QRS'),
    ).resolves.toBe(preview);
  });

  it('phân biệt mã sai với mã hết hạn', async () => {
    const missing = { preview: vi.fn().mockResolvedValue({ kind: 'not_found' }) };
    const expired = { preview: vi.fn().mockResolvedValue({ kind: 'expired' }) };

    await expect(
      new InviteService(missing as unknown as InviteRepository).preview('8F2K9QRS'),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      new InviteService(expired as unknown as InviteRepository).preview('8F2K9QRS'),
    ).rejects.toBeInstanceOf(GoneException);
  });
});
