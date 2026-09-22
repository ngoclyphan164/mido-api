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
    if (!group) throw new NotFoundException('Group not found, or you are not a member of it');
    return group;
  }

  async update(groupId: string, userId: string, name: string) {
    const result = await this.repository.update(groupId, userId, name);
    switch (result.kind) {
      case 'ok':
        return result.group;
      case 'forbidden':
        throw new ForbiddenException('Only a group owner or admin can edit the group');
      case 'not_found':
        throw new NotFoundException('Group not found, or you are not a member of it');
    }
  }

  async remove(groupId: string, userId: string): Promise<void> {
    const result = await this.repository.remove(groupId, userId);
    switch (result.kind) {
      case 'ok':
        return;
      case 'forbidden':
        throw new ForbiddenException('Only the group owner can delete the group');
      case 'not_found':
        throw new NotFoundException('Group not found, or you are not a member of it');
    }
  }

  async join(userId: string, inviteCode: string) {
    const result = await this.repository.joinByInviteCode(userId, inviteCode);
    switch (result.kind) {
      case 'ok':
        return { group: result.group, alreadyMember: result.alreadyMember };
      case 'expired':
        throw new GoneException('This invite link has expired; ask the group owner for a new one');
      case 'not_found':
        throw new NotFoundException('Invalid invite code');
    }
  }

  async rotateInvite(groupId: string, userId: string, inviteTtlHours: number) {
    const result = await this.repository.rotateInvite(groupId, userId, inviteTtlHours);
    switch (result.kind) {
      case 'ok':
        return { inviteCode: result.inviteCode, inviteExpiresAt: result.inviteExpiresAt };
      case 'forbidden':
        throw new ForbiddenException('Only a group owner or admin can create a new invite link');
      case 'not_found':
        throw new NotFoundException('Group not found, or you are not a member of it');
    }
  }
}
