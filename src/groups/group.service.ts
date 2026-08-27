import { ForbiddenException, GoneException, Injectable, NotFoundException } from '@nestjs/common';

import { GroupRepository } from './group.repository';

@Injectable()
export class GroupService {
  constructor(private readonly repository: GroupRepository) {}

  create(userId: string, name: string, inviteTtlHours: number) {
    return this.repository.create(userId, name, inviteTtlHours);
  }

  list(userId: string) {
    return this.repository.listForUser(userId);
  }

  async detail(groupId: string, userId: string) {
    const group = await this.repository.findDetail(groupId, userId);
    if (!group) throw new NotFoundException('Không tìm thấy nhóm hoặc bạn không thuộc nhóm này');
    return group;
  }

  async update(groupId: string, userId: string, name: string) {
    const result = await this.repository.update(groupId, userId, name);
    switch (result.kind) {
      case 'ok':
        return result.group;
      case 'forbidden':
        throw new ForbiddenException('Chỉ owner hoặc admin mới được sửa nhóm');
      case 'not_found':
        throw new NotFoundException('Không tìm thấy nhóm hoặc bạn không thuộc nhóm này');
    }
  }

  async remove(groupId: string, userId: string): Promise<void> {
    const result = await this.repository.remove(groupId, userId);
    switch (result.kind) {
      case 'ok':
        return;
      case 'forbidden':
        throw new ForbiddenException('Chỉ owner mới được xóa nhóm');
      case 'not_found':
        throw new NotFoundException('Không tìm thấy nhóm hoặc bạn không thuộc nhóm này');
    }
  }

  async join(userId: string, inviteCode: string) {
    const result = await this.repository.joinByInviteCode(userId, inviteCode);
    switch (result.kind) {
      case 'ok':
        return { group: result.group, alreadyMember: result.alreadyMember };
      case 'expired':
        throw new GoneException('Link mời đã hết hiệu lực, xin chủ nhóm tạo link mới');
      case 'not_found':
        throw new NotFoundException('Mã mời không đúng');
    }
  }

  async rotateInvite(groupId: string, userId: string, inviteTtlHours: number) {
    const result = await this.repository.rotateInvite(groupId, userId, inviteTtlHours);
    switch (result.kind) {
      case 'ok':
        return { inviteCode: result.inviteCode, inviteExpiresAt: result.inviteExpiresAt };
      case 'forbidden':
        throw new ForbiddenException('Chỉ owner hoặc admin mới được tạo link mời mới');
      case 'not_found':
        throw new NotFoundException('Không tìm thấy nhóm hoặc bạn không thuộc nhóm này');
    }
  }
}
