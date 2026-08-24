import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';

import type { CreateHangoutInput, UpsertParticipantInput } from './hangout.repository';
import { HangoutRepository } from './hangout.repository';

@Injectable()
export class HangoutService {
  constructor(private readonly repository: HangoutRepository) {}

  async create(groupId: string, userId: string, input: CreateHangoutInput) {
    if (!(await this.repository.isGroupMember(groupId, userId))) {
      throw new NotFoundException('Không tìm thấy nhóm hoặc bạn không thuộc nhóm này');
    }
    const hangoutId = await this.repository.create(groupId, userId, input);
    return this.detail(hangoutId, userId);
  }

  async listForGroup(groupId: string, userId: string) {
    if (!(await this.repository.isGroupMember(groupId, userId))) {
      throw new NotFoundException('Không tìm thấy nhóm hoặc bạn không thuộc nhóm này');
    }
    return this.repository.listForGroup(groupId);
  }

  async detail(hangoutId: string, userId: string) {
    const hangout = await this.repository.findDetail(hangoutId, userId);
    if (!hangout) throw new NotFoundException('Không tìm thấy kèo hoặc bạn không thuộc nhóm này');
    return hangout;
  }

  async upsertOwnParticipant(hangoutId: string, userId: string, input: UpsertParticipantInput) {
    // Reuse the detail read for its membership check, and to refuse edits once
    // the kèo has moved past planning.
    const hangout = await this.detail(hangoutId, userId);
    if (hangout.status === 'done' || hangout.status === 'cancelled') {
      throw new ForbiddenException(
        `Không sửa được vị trí khi kèo đang ở trạng thái ${hangout.status}`,
      );
    }

    const participant = await this.repository.upsertOwnParticipant(hangoutId, userId, input);
    if (!participant) throw new NotFoundException('Không tìm thấy profile của bạn');
    return participant;
  }
}
