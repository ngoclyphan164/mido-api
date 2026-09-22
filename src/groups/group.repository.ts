import { Injectable } from '@nestjs/common';
import { and, eq, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';

import { DatabaseService } from '../database/database.service';
import { groupMembers, groups, profiles } from '../database/schema';
import { generateInviteCode, hashInviteCode, normalizeInviteCode } from './invite-code';

export type GroupRole = 'owner' | 'admin' | 'member';

export type GroupMemberView = {
  userId: string;
  displayName: string;
  role: GroupRole;
  joinedAt: Date;
};

export type GroupView = {
  id: string;
  name: string;
  role: GroupRole;
  memberCount: number;
  inviteExpiresAt: Date;
  createdBy: string;
  createdAt: Date;
};

export type GroupDetailView = GroupView & { members: GroupMemberView[] };

/** The raw code is only ever returned right after it is minted. */
export type CreatedGroup = { group: GroupDetailView; inviteCode: string };

export type JoinResult =
  | { kind: 'ok'; group: GroupDetailView; alreadyMember: boolean }
  | { kind: 'not_found' | 'expired' };

export type RotateResult =
  { kind: 'ok'; inviteCode: string; inviteExpiresAt: Date } | { kind: 'not_found' | 'forbidden' };

export type UpdateGroupResult =
  { kind: 'ok'; group: GroupDetailView } | { kind: 'not_found' | 'forbidden' };

export type DeleteGroupResult = { kind: 'ok' } | { kind: 'not_found' | 'forbidden' };

const INVITE_COLLISION_RETRIES = 5;

/** Second alias on group_members, for counting every member of a group. */
const allMembers = alias(groupMembers, 'all_members');

@Injectable()
export class GroupRepository {
  constructor(private readonly database: DatabaseService) {}

  async create(userId: string, name: string, inviteTtlHours: number): Promise<CreatedGroup> {
    const inviteExpiresAt = new Date(Date.now() + inviteTtlHours * 3_600_000);

    // The invite hash is uniquely indexed, so a collision is a retry rather
    // than an error the caller should ever see.
    for (let attempt = 0; attempt < INVITE_COLLISION_RETRIES; attempt += 1) {
      const inviteCode = generateInviteCode();
      try {
        const groupId = await this.database.db.transaction(async (tx) => {
          const [created] = await tx
            .insert(groups)
            .values({
              name,
              inviteCodeHash: hashInviteCode(inviteCode),
              inviteExpiresAt,
              createdBy: userId,
            })
            .returning({ id: groups.id });

          await tx.insert(groupMembers).values({ groupId: created!.id, userId, role: 'owner' });

          return created!.id;
        });

        const group = await this.findDetail(groupId, userId);
        return { group: group!, inviteCode };
      } catch (error) {
        if (this.isInviteCollision(error) && attempt < INVITE_COLLISION_RETRIES - 1) continue;
        throw error;
      }
    }

    throw new Error('Could not generate an invite code after several attempts');
  }

  async listForUser(userId: string): Promise<GroupView[]> {
    const rows = await this.database.db
      .select({
        id: groups.id,
        name: groups.name,
        role: groupMembers.role,
        inviteExpiresAt: groups.inviteExpiresAt,
        createdBy: groups.createdBy,
        createdAt: groups.createdAt,
        // Counted over a second alias so the caller's own membership row (the
        // one this query joins on) doesn't cap the count at one. A correlated
        // subquery would work today only because group_members has no `id`
        // column for Drizzle's unqualified rendering to collide with.
        memberCount: sql<number>`count(${allMembers.userId})::int`,
      })
      .from(groups)
      .innerJoin(groupMembers, eq(groupMembers.groupId, groups.id))
      .leftJoin(allMembers, eq(allMembers.groupId, groups.id))
      .where(eq(groupMembers.userId, userId))
      .groupBy(groups.id, groupMembers.role)
      .orderBy(groups.createdAt);

    return rows.map((row) => ({ ...row, memberCount: Number(row.memberCount) }));
  }

  /** Returns undefined when the group is missing or the caller isn't a member. */
  async findDetail(groupId: string, userId: string): Promise<GroupDetailView | undefined> {
    const [group] = await this.database.db
      .select({
        id: groups.id,
        name: groups.name,
        role: groupMembers.role,
        inviteExpiresAt: groups.inviteExpiresAt,
        createdBy: groups.createdBy,
        createdAt: groups.createdAt,
      })
      .from(groups)
      .innerJoin(
        groupMembers,
        and(eq(groupMembers.groupId, groups.id), eq(groupMembers.userId, userId)),
      )
      .where(eq(groups.id, groupId))
      .limit(1);

    if (!group) return undefined;

    const members = await this.listMembers(groupId);
    return { ...group, memberCount: members.length, members };
  }

  async listMembers(groupId: string): Promise<GroupMemberView[]> {
    return this.database.db
      .select({
        userId: groupMembers.userId,
        displayName: profiles.displayName,
        role: groupMembers.role,
        joinedAt: groupMembers.joinedAt,
      })
      .from(groupMembers)
      .innerJoin(profiles, eq(profiles.id, groupMembers.userId))
      .where(eq(groupMembers.groupId, groupId))
      .orderBy(groupMembers.joinedAt, groupMembers.userId);
  }

  async update(groupId: string, userId: string, name: string): Promise<UpdateGroupResult> {
    const role = await this.findMemberRole(groupId, userId);
    if (!role) return { kind: 'not_found' };
    if (role === 'member') return { kind: 'forbidden' };

    const [updated] = await this.database.db
      .update(groups)
      .set({ name, updatedAt: new Date() })
      .where(eq(groups.id, groupId))
      .returning({ id: groups.id });
    if (!updated) return { kind: 'not_found' };

    const group = await this.findDetail(groupId, userId);
    if (!group) return { kind: 'not_found' };
    return { kind: 'ok', group };
  }

  async remove(groupId: string, userId: string): Promise<DeleteGroupResult> {
    const role = await this.findMemberRole(groupId, userId);
    if (!role) return { kind: 'not_found' };
    if (role !== 'owner') return { kind: 'forbidden' };

    const [deleted] = await this.database.db
      .delete(groups)
      .where(eq(groups.id, groupId))
      .returning({ id: groups.id });
    return deleted ? { kind: 'ok' } : { kind: 'not_found' };
  }

  async joinByInviteCode(userId: string, rawCode: string): Promise<JoinResult> {
    const [group] = await this.database.db
      .select({ id: groups.id, inviteExpiresAt: groups.inviteExpiresAt })
      .from(groups)
      .where(eq(groups.inviteCodeHash, hashInviteCode(normalizeInviteCode(rawCode))))
      .limit(1);

    if (!group) return { kind: 'not_found' };
    if (group.inviteExpiresAt.getTime() <= Date.now()) return { kind: 'expired' };

    const [existing] = await this.database.db
      .select({ userId: groupMembers.userId })
      .from(groupMembers)
      .where(and(eq(groupMembers.groupId, group.id), eq(groupMembers.userId, userId)))
      .limit(1);

    if (!existing) {
      await this.database.db
        .insert(groupMembers)
        .values({ groupId: group.id, userId, role: 'member' })
        .onConflictDoNothing();
    }

    const detail = await this.findDetail(group.id, userId);
    return { kind: 'ok', group: detail!, alreadyMember: Boolean(existing) };
  }

  /**
   * Only the hash is stored, so an existing code can never be shown again — the
   * way to surface a link after creation is to mint a fresh one.
   */
  async rotateInvite(
    groupId: string,
    userId: string,
    inviteTtlHours: number,
  ): Promise<RotateResult> {
    const [membership] = await this.database.db
      .select({ role: groupMembers.role })
      .from(groupMembers)
      .innerJoin(groups, eq(groups.id, groupMembers.groupId))
      .where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.userId, userId)))
      .limit(1);

    if (!membership) return { kind: 'not_found' };
    if (membership.role === 'member') return { kind: 'forbidden' };

    const inviteExpiresAt = new Date(Date.now() + inviteTtlHours * 3_600_000);

    for (let attempt = 0; attempt < INVITE_COLLISION_RETRIES; attempt += 1) {
      const inviteCode = generateInviteCode();
      try {
        await this.database.db
          .update(groups)
          .set({
            inviteCodeHash: hashInviteCode(inviteCode),
            inviteExpiresAt,
            updatedAt: new Date(),
          })
          .where(eq(groups.id, groupId));
        return { kind: 'ok', inviteCode, inviteExpiresAt };
      } catch (error) {
        if (this.isInviteCollision(error) && attempt < INVITE_COLLISION_RETRIES - 1) continue;
        throw error;
      }
    }

    throw new Error('Could not generate an invite code after several attempts');
  }

  private async findMemberRole(groupId: string, userId: string): Promise<GroupRole | undefined> {
    const [membership] = await this.database.db
      .select({ role: groupMembers.role })
      .from(groupMembers)
      .innerJoin(groups, eq(groups.id, groupMembers.groupId))
      .where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.userId, userId)))
      .limit(1);
    return membership?.role;
  }

  private isInviteCollision(error: unknown): boolean {
    const candidate = error as { code?: string; constraint_name?: string } | null;
    return (
      candidate?.code === '23505' || candidate?.constraint_name === 'groups_invite_code_hash_uidx'
    );
  }
}
