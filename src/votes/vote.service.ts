import { Injectable, NotFoundException } from '@nestjs/common';

import type { VoteValue } from './vote.repository';
import { VoteRepository } from './vote.repository';

@Injectable()
export class VoteService {
  constructor(private readonly repository: VoteRepository) {}

  async castVote(suggestionId: string, userId: string, value: VoteValue) {
    const result = await this.repository.castVote(suggestionId, userId, value);
    if (!result) {
      throw new NotFoundException(
        'Suggestion không tồn tại, đã hết hiệu lực hoặc bạn không phải participant',
      );
    }
    return result;
  }
}
