import { NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import type { VoteRepository } from './vote.repository';
import { VoteService } from './vote.service';

describe('VoteService', () => {
  it('trả vote mới nhất và tally từ repository', async () => {
    const result = {
      vote: {
        id: 'vote-id',
        suggestionId: 'suggestion-id',
        participantId: 'participant-id',
        value: 'up' as const,
        updatedAt: new Date('2026-08-24T13:00:00Z'),
      },
      tally: { up: 2, down: 1, veto: 0, total: 3 },
    };
    const castVote = vi.fn().mockResolvedValue(result);
    const service = new VoteService({ castVote } as unknown as VoteRepository);

    await expect(service.castVote('suggestion-id', 'user-id', 'up')).resolves.toBe(result);
    expect(castVote).toHaveBeenCalledWith('suggestion-id', 'user-id', 'up');
  });

  it('không tiết lộ suggestion nếu user không phải participant', async () => {
    const service = new VoteService({
      castVote: vi.fn().mockResolvedValue(undefined),
    } as unknown as VoteRepository);

    await expect(service.castVote('suggestion-id', 'outsider-id', 'veto')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
