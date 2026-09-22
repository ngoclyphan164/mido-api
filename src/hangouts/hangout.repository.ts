import { Injectable } from '@nestjs/common';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';

import { geographyLat, geographyLng, toGeographyPoint } from '../database/geography';
import { DatabaseService } from '../database/database.service';
import {
  groupMembers,
  groups,
  hangouts,
  outings,
  participants,
  profiles,
} from '../database/schema';

type FairnessMode = 'balanced' | 'fairest' | 'fastest' | 'weighted';
type HangoutStatus = 'draft' | 'voting' | 'decided' | 'done' | 'cancelled';
type TravelMode = 'two_wheeler' | 'drive' | 'walk' | 'transit';

export type CreateHangoutInput = {
  activityType: string;
  plannedAt: Date;
  fairnessMode: FairnessMode;
  budgetMax?: number;
  timeCapSeconds: number;
  idempotencyKey: string;
};

export type UpdateHangoutInput = {
  activityType?: string;
  plannedAt?: Date;
  fairnessMode?: FairnessMode;
  budgetMax?: number | null;
  timeCapSeconds?: number;
};

export type UpsertParticipantInput = {
  lat: number;
  lng: number;
  originAddress?: string | null;
  /** Bỏ trống thì lấy `profiles.default_travel_mode`. */
  travelMode?: TravelMode;
  displayName?: string;
  weight?: number;
  isFlexible?: boolean;
};

export type ParticipantView = {
  id: string;
  userId: string;
  displayName: string;
  origin: { lat: number; lng: number };
  originAddress?: string;
  travelMode: TravelMode;
  weight: number;
  isFlexible: boolean;
};

export type HangoutSummaryView = {
  id: string;
  groupId: string;
  activityType: string;
  plannedAt: Date;
  fairnessMode: FairnessMode;
  budgetMax: number | null;
  timeCapSeconds: number;
  status: HangoutStatus;
  createdBy: string;
  createdAt: Date;
  participantCount: number;
};

export type HangoutDetailView = Omit<HangoutSummaryView, 'participantCount'> & {
  groupName: string;
  role: 'owner' | 'admin' | 'member';
  participants: ParticipantView[];
  /** Group members who haven't shared a starting point yet. */
  pendingMembers: { userId: string; displayName: string }[];
  outing: {
    id: string;
    chosenSuggestionId: string | null;
    decidedBy: string | null;
    decidedAt: Date;
    happenedAt: Date | null;
  } | null;
};

/**
 * Neither result carries `forbidden`: any member of the group may edit and
 * delete its hangouts. A plan belongs to the group rather than to whoever
 * happened to type it in, and a member who cannot move the time by an hour
 * just asks someone else to — the same edit, only slower.
 *
 * Membership is still enforced, by the inner join in `findStatusForMember`:
 * a non-member gets `not_found`, which deliberately declines to confirm that
 * the hangout exists at all.
 */
export type UpdateHangoutResult =
  | { kind: 'ok'; hangout: HangoutDetailView }
  | { kind: 'not_found' }
  | { kind: 'immutable'; status: HangoutStatus };

export type DeleteHangoutResult =
  { kind: 'ok' } | { kind: 'not_found' } | { kind: 'immutable'; status: HangoutStatus };

const originLat = geographyLat(participants.origin);
const originLng = geographyLng(participants.origin);

@Injectable()
export class HangoutRepository {
  constructor(private readonly database: DatabaseService) {}

  async isGroupMember(groupId: string, userId: string): Promise<boolean> {
    const [membership] = await this.database.db
      .select({ userId: groupMembers.userId })
      .from(groupMembers)
      .where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.userId, userId)))
      .limit(1);
    return Boolean(membership);
  }

  /**
   * Idempotent on (createdBy, idempotencyKey) — the table has a unique index on
   * that pair, so a retried create returns the original row instead of a 409.
   */
  async create(groupId: string, userId: string, input: CreateHangoutInput): Promise<string> {
    const [created] = await this.database.db
      .insert(hangouts)
      .values({
        groupId,
        createdBy: userId,
        activityType: input.activityType,
        plannedAt: input.plannedAt,
        fairnessMode: input.fairnessMode,
        budgetMax: input.budgetMax,
        timeCapSeconds: input.timeCapSeconds,
        idempotencyKey: input.idempotencyKey,
      })
      .onConflictDoNothing({ target: [hangouts.createdBy, hangouts.idempotencyKey] })
      .returning({ id: hangouts.id });

    if (created) return created.id;

    const [existing] = await this.database.db
      .select({ id: hangouts.id })
      .from(hangouts)
      .where(and(eq(hangouts.createdBy, userId), eq(hangouts.idempotencyKey, input.idempotencyKey)))
      .limit(1);

    return existing!.id;
  }

  async listForGroup(groupId: string): Promise<HangoutSummaryView[]> {
    const rows = await this.database.db
      .select({
        id: hangouts.id,
        groupId: hangouts.groupId,
        activityType: hangouts.activityType,
        plannedAt: hangouts.plannedAt,
        fairnessMode: hangouts.fairnessMode,
        budgetMax: hangouts.budgetMax,
        timeCapSeconds: hangouts.timeCapSeconds,
        status: hangouts.status,
        createdBy: hangouts.createdBy,
        createdAt: hangouts.createdAt,
        // A join rather than a correlated subquery: Drizzle renders
        // `hangouts.id` unqualified inside raw sql, so `counted.hangout_id =
        // id` resolved against participants.id and always counted zero.
        participantCount: sql<number>`count(${participants.id})::int`,
      })
      .from(hangouts)
      .leftJoin(participants, eq(participants.hangoutId, hangouts.id))
      .where(eq(hangouts.groupId, groupId))
      .groupBy(hangouts.id)
      .orderBy(desc(hangouts.plannedAt), desc(hangouts.createdAt));

    return rows.map((row) => ({ ...row, participantCount: Number(row.participantCount) }));
  }

  /** Undefined when the hangout is missing or the caller isn't in its group. */
  async findDetail(hangoutId: string, userId: string): Promise<HangoutDetailView | undefined> {
    const [hangout] = await this.database.db
      .select({
        id: hangouts.id,
        groupId: hangouts.groupId,
        groupName: groups.name,
        role: groupMembers.role,
        activityType: hangouts.activityType,
        plannedAt: hangouts.plannedAt,
        fairnessMode: hangouts.fairnessMode,
        budgetMax: hangouts.budgetMax,
        timeCapSeconds: hangouts.timeCapSeconds,
        status: hangouts.status,
        createdBy: hangouts.createdBy,
        createdAt: hangouts.createdAt,
      })
      .from(hangouts)
      .innerJoin(groups, eq(groups.id, hangouts.groupId))
      .innerJoin(
        groupMembers,
        and(eq(groupMembers.groupId, hangouts.groupId), eq(groupMembers.userId, userId)),
      )
      .where(eq(hangouts.id, hangoutId))
      .limit(1);

    if (!hangout) return undefined;

    const participantRows = await this.database.db
      .select({
        id: participants.id,
        userId: participants.userId,
        displayName: participants.displayName,
        originAddress: participants.originAddress,
        travelMode: participants.travelMode,
        weight: participants.weight,
        isFlexible: participants.isFlexible,
        lat: originLat,
        lng: originLng,
      })
      .from(participants)
      .where(eq(participants.hangoutId, hangoutId))
      .orderBy(participants.createdAt, participants.id);

    const memberRows = await this.database.db
      .select({ userId: groupMembers.userId, displayName: profiles.displayName })
      .from(groupMembers)
      .innerJoin(profiles, eq(profiles.id, groupMembers.userId))
      .where(eq(groupMembers.groupId, hangout.groupId))
      .orderBy(groupMembers.joinedAt, groupMembers.userId);

    const [outing] = await this.database.db
      .select({
        id: outings.id,
        chosenSuggestionId: outings.chosenSuggestionId,
        decidedBy: outings.decidedBy,
        decidedAt: outings.decidedAt,
        happenedAt: outings.happenedAt,
      })
      .from(outings)
      .where(eq(outings.hangoutId, hangoutId))
      .limit(1);

    const joinedUserIds = new Set(participantRows.map((row) => row.userId));

    return {
      ...hangout,
      participants: participantRows.map((row) => ({
        id: row.id,
        userId: row.userId,
        displayName: row.displayName,
        origin: { lat: Number(row.lat), lng: Number(row.lng) },
        originAddress: row.originAddress ?? undefined,
        travelMode: row.travelMode,
        weight: Number(row.weight),
        isFlexible: row.isFlexible,
      })),
      pendingMembers: memberRows.filter((member) => !joinedUserIds.has(member.userId)),
      outing: outing ?? null,
    };
  }

  async update(
    hangoutId: string,
    userId: string,
    input: UpdateHangoutInput,
  ): Promise<UpdateHangoutResult> {
    const status = await this.findStatusForMember(hangoutId, userId);
    if (!status) return { kind: 'not_found' };
    if (status !== 'draft' && status !== 'voting') {
      return { kind: 'immutable', status };
    }

    const [updated] = await this.database.db
      .update(hangouts)
      .set({
        ...(input.activityType === undefined ? null : { activityType: input.activityType }),
        ...(input.plannedAt === undefined ? null : { plannedAt: input.plannedAt }),
        ...(input.fairnessMode === undefined ? null : { fairnessMode: input.fairnessMode }),
        ...(input.budgetMax === undefined ? null : { budgetMax: input.budgetMax }),
        ...(input.timeCapSeconds === undefined ? null : { timeCapSeconds: input.timeCapSeconds }),
        updatedAt: new Date(),
      })
      .where(and(eq(hangouts.id, hangoutId), inArray(hangouts.status, ['draft', 'voting'])))
      .returning({ id: hangouts.id });
    if (!updated) {
      const latest = await this.findStatusForMember(hangoutId, userId);
      return latest ? { kind: 'immutable', status: latest } : { kind: 'not_found' };
    }

    const hangout = await this.findDetail(hangoutId, userId);
    if (!hangout) return { kind: 'not_found' };
    return { kind: 'ok', hangout };
  }

  async remove(hangoutId: string, userId: string): Promise<DeleteHangoutResult> {
    const status = await this.findStatusForMember(hangoutId, userId);
    if (!status) return { kind: 'not_found' };
    if (status === 'decided' || status === 'done') {
      return { kind: 'immutable', status };
    }

    const [deleted] = await this.database.db
      .delete(hangouts)
      .where(
        and(eq(hangouts.id, hangoutId), inArray(hangouts.status, ['draft', 'voting', 'cancelled'])),
      )
      .returning({ id: hangouts.id });
    if (deleted) return { kind: 'ok' };

    const latest = await this.findStatusForMember(hangoutId, userId);
    return latest ? { kind: 'immutable', status: latest } : { kind: 'not_found' };
  }

  /**
   * Upserts the caller's own starting point. Unique on (hangoutId, userId), so
   * re-submitting moves the pin rather than adding a second participant.
   */
  async upsertOwnParticipant(
    hangoutId: string,
    userId: string,
    input: UpsertParticipantInput,
  ): Promise<ParticipantView | undefined> {
    const [profile] = await this.database.db
      .select({
        displayName: profiles.displayName,
        defaultTravelMode: profiles.defaultTravelMode,
      })
      .from(profiles)
      .where(eq(profiles.id, userId))
      .limit(1);

    const displayName = input.displayName ?? profile?.displayName;
    if (!displayName) return undefined;

    // The column is NOT NULL DEFAULT 'two_wheeler', so the profile always has an
    // answer once the row exists — no third fallback needed.
    const travelMode = input.travelMode ?? profile?.defaultTravelMode ?? 'two_wheeler';

    const origin = toGeographyPoint({ lat: input.lat, lng: input.lng });
    const weight = input.weight === undefined ? undefined : input.weight.toFixed(2);
    const now = new Date();

    await this.database.db
      .insert(participants)
      .values({
        hangoutId,
        userId,
        displayName,
        origin,
        originAddress: input.originAddress ?? null,
        travelMode,
        ...(weight === undefined ? null : { weight }),
        ...(input.isFlexible === undefined ? null : { isFlexible: input.isFlexible }),
      })
      .onConflictDoUpdate({
        target: [participants.hangoutId, participants.userId],
        set: {
          displayName,
          origin,
          // Never retain an address that belonged to the previous coordinate.
          originAddress: input.originAddress ?? null,
          travelMode,
          ...(weight === undefined ? null : { weight }),
          ...(input.isFlexible === undefined ? null : { isFlexible: input.isFlexible }),
          updatedAt: now,
        },
      });

    const [row] = await this.database.db
      .select({
        id: participants.id,
        userId: participants.userId,
        displayName: participants.displayName,
        originAddress: participants.originAddress,
        travelMode: participants.travelMode,
        weight: participants.weight,
        isFlexible: participants.isFlexible,
        lat: originLat,
        lng: originLng,
      })
      .from(participants)
      .where(and(eq(participants.hangoutId, hangoutId), eq(participants.userId, userId)))
      .limit(1);

    if (!row) return undefined;

    return {
      id: row.id,
      userId: row.userId,
      displayName: row.displayName,
      origin: { lat: Number(row.lat), lng: Number(row.lng) },
      originAddress: row.originAddress ?? undefined,
      travelMode: row.travelMode,
      weight: Number(row.weight),
      isFlexible: row.isFlexible,
    };
  }

  /**
   * The hangout's status, but only for someone in its group — the inner join
   * is the whole authorization check for editing and deleting. `undefined`
   * covers both "no such hangout" and "not your group", and the callers turn
   * that into 404 either way so the two stay indistinguishable from outside.
   *
   * Neither the creator nor the caller's role is selected any more: every
   * member gets the same rights over a hangout, so there is nothing left to
   * compare them against.
   */
  private async findStatusForMember(
    hangoutId: string,
    userId: string,
  ): Promise<HangoutStatus | undefined> {
    const [row] = await this.database.db
      .select({ status: hangouts.status })
      .from(hangouts)
      .innerJoin(
        groupMembers,
        and(eq(groupMembers.groupId, hangouts.groupId), eq(groupMembers.userId, userId)),
      )
      .where(eq(hangouts.id, hangoutId))
      .limit(1);
    return row?.status;
  }
}
