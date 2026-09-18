import { Injectable } from '@nestjs/common';
import { eq, sql } from 'drizzle-orm';

import { DatabaseService } from '../database/database.service';
import { groupMembers, groups } from '../database/schema';
import { hashInviteCode } from '../groups/invite-code';

export type InvitePreviewView = {
  groupName: string;
  memberCount: number;
  inviteExpiresAt: Date;
};

export type InvitePreviewResult =
  { kind: 'ok'; preview: InvitePreviewView } | { kind: 'not_found' | 'expired' };

@Injectable()
export class InviteRepository {
  constructor(private readonly database: DatabaseService) {}

  /**
   * Chỉ một lần dò index: bảng lưu SHA-256 của mã, và
   * `groups_invite_code_hash_uidx` là unique index trên đúng cột đó.
   * `hashInviteCode` tự normalize nên không cần gọi `normalizeInviteCode` trước.
   */
  async preview(rawCode: string): Promise<InvitePreviewResult> {
    const [group] = await this.database.db
      .select({
        name: groups.name,
        inviteExpiresAt: groups.inviteExpiresAt,
        // Truy vấn con tương quan thay vì join + groupBy: ở đây chỉ có một nhóm,
        // và `group_members` không có cột `id` để Drizzle render nhầm.
        memberCount: sql<number>`(
          select count(*)::int from ${groupMembers}
          where ${groupMembers.groupId} = ${groups.id}
        )`,
      })
      .from(groups)
      .where(eq(groups.inviteCodeHash, hashInviteCode(rawCode)))
      .limit(1);

    if (!group) return { kind: 'not_found' };
    if (group.inviteExpiresAt.getTime() <= Date.now()) return { kind: 'expired' };

    return {
      kind: 'ok',
      preview: {
        groupName: group.name,
        memberCount: Number(group.memberCount),
        inviteExpiresAt: group.inviteExpiresAt,
      },
    };
  }
}
