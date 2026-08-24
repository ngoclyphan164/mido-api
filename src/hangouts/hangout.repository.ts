import { Injectable } from '@nestjs/common';
import { and, desc, eq, sql } from 'drizzle-orm';

import { toGeographyPoint } from '../database/geography';
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

export type UpsertParticipantInput = {
  lat: number;
  lng: number;
  travelMode: TravelMode;
  displayName?: string;
  weight?: number;
  isFlexible?: boolean;
};

export type ParticipantView = {
  id: string;
  userId: string;
  displayName: string;
  origin: { lat: number; lng: number };
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
    decidedBy: string;
    decidedAt: Date;
    happenedAt: Date | null;
  } | null;
};

const originLat = sql<number>`extensions.ST_Y(${participants.origin}::extensions.geometry)::double precision`;
const originLng = sql<number>`extensions.ST_X(${participants.origin}::extensions.geometry)::double precision`;

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
        participantCount: sql<number>`(
          select count(*)::int from ${participants} as counted
          where counted.hangout_id = ${hangouts.id}
        )`,
      })
      .from(hangouts)
      .where(eq(hangouts.groupId, groupId))
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
        travelMode: row.travelMode,
        weight: Number(row.weight),
        isFlexible: row.isFlexible,
      })),
      pendingMembers: memberRows.filter((member) => !joinedUserIds.has(member.userId)),
      outing: outing ?? null,
    };
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
      .select({ displayName: profiles.displayName })
      .from(profiles)
      .where(eq(profiles.id, userId))
      .limit(1);

    const displayName = input.displayName ?? profile?.displayName;
    if (!displayName) return undefined;

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
        travelMode: input.travelMode,
        ...(weight === undefined ? null : { weight }),
        ...(input.isFlexible === undefined ? null : { isFlexible: input.isFlexible }),
      })
      .onConflictDoUpdate({
        target: [participants.hangoutId, participants.userId],
        set: {
          displayName,
          origin,
          travelMode: input.travelMode,
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
      travelMode: row.travelMode,
      weight: Number(row.weight),
      isFlexible: row.isFlexible,
    };
  }
}
