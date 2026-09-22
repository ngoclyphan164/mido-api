import { Injectable, NotFoundException } from '@nestjs/common';

import { PickRepository } from './pick.repository';

@Injectable()
export class PickService {
  constructor(private readonly repository: PickRepository) {}

  async setPick(hangoutId: string, userId: string, suggestionId: string) {
    const pick = await this.repository.setPick(hangoutId, userId, suggestionId);
    if (!pick) {
      throw new NotFoundException(
        'Suggestion does not exist, is no longer active, or you have not shared a starting point for this hangout',
      );
    }
    return pick;
  }

  /**
   * Bỏ tick là idempotent: chưa chọn gì mà gọi vẫn là 204. Người dùng bấm hai
   * lần vì mạng chậm không đáng nhận lỗi, và kết quả cuối cùng vẫn như nhau.
   */
  async clearPick(hangoutId: string, userId: string): Promise<void> {
    await this.repository.clearPick(hangoutId, userId);
  }
}
