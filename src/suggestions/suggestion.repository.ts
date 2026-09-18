import { Injectable } from '@nestjs/common';
import { and, eq, inArray, sql } from 'drizzle-orm';

import { DatabaseService } from '../database/database.service';
import { geographyLat, geographyLng } from '../database/geography';
import {
  fairnessLedger,
  groupMembers,
  hangouts,
  participants,
  providerPlaceRefs,
  suggestions,
} from '../database/schema';
import type { Coordinate } from '../midpoint/geometry';
import type { FairnessMode } from '../midpoint/scoring';
import type { PlaceCandidate } from '../places/places-provider';
import type { TravelMode } from '../routing/routing-provider';

export type SuggestionParticipant = {
  id: string;
  userId: string;
  name: string;
  origin: Coordinate;
  mode: TravelMode;
  weight: number;
  fairnessDebtSeconds: number;
};

export type HangoutSuggestionContext = {
  id: string;
  activityType: string;
  plannedAt: Date;
  fairnessMode: FairnessMode;
  budgetMax?: number;
  timeCapSeconds: number;
  status: 'draft' | 'voting' | 'decided' | 'done' | 'cancelled';
  participants: SuggestionParticipant[];
};

const fairnessModes: Record<string, FairnessMode> = {
  balanced: 'BALANCED',
  fairest: 'FAIREST',
  fastest: 'FASTEST',
  weighted: 'WEIGHTED',
};

@Injectable()
export class SuggestionRepository {
  constructor(private readonly database: DatabaseService) {}

  async loadContext(
    hangoutId: string,
    userId: string,
  ): Promise<HangoutSuggestionContext | undefined> {
    const [hangout] = await this.database.db
      .select({
        id: hangouts.id,
        groupId: hangouts.groupId,
        activityType: hangouts.activityType,
        plannedAt: hangouts.plannedAt,
        fairnessMode: hangouts.fairnessMode,
        budgetMax: hangouts.budgetMax,
        timeCapSeconds: hangouts.timeCapSeconds,
        status: hangouts.status,
      })
      .from(hangouts)
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
        name: participants.displayName,
        mode: participants.travelMode,
        weight: participants.weight,
        lat: geographyLat(participants.origin),
        lng: geographyLng(participants.origin),
      })
      .from(participants)
      .where(eq(participants.hangoutId, hangoutId))
      .orderBy(participants.createdAt, participants.id);

    const debtRows =
      participantRows.length === 0
        ? []
        : await this.database.db
            .select({
              userId: fairnessLedger.userId,
              debtSeconds: sql<number>`coalesce(sum(${fairnessLedger.deltaSeconds}), 0)::int`,
            })
            .from(fairnessLedger)
            .where(
              and(
                eq(fairnessLedger.groupId, hangout.groupId),
                inArray(
                  fairnessLedger.userId,
                  participantRows.map((participant) => participant.userId),
                ),
              ),
            )
            .groupBy(fairnessLedger.userId);
    const debtByUser = new Map(debtRows.map((entry) => [entry.userId, Number(entry.debtSeconds)]));

    return {
      id: hangout.id,
      activityType: hangout.activityType,
      plannedAt: hangout.plannedAt,
      fairnessMode: fairnessModes[hangout.fairnessMode]!,
      budgetMax: hangout.budgetMax ?? undefined,
      timeCapSeconds: hangout.timeCapSeconds,
      status: hangout.status,
      participants: participantRows.map((participant) => ({
        id: participant.id,
        userId: participant.userId,
        name: participant.name,
        origin: { lat: Number(participant.lat), lng: Number(participant.lng) },
        mode: participant.mode,
        weight: Number(participant.weight),
        fairnessDebtSeconds: debtByUser.get(participant.userId) ?? 0,
      })),
    };
  }

  async syncActiveSuggestions(
    hangoutId: string,
    places: readonly PlaceCandidate[],
  ): Promise<Map<string, string>> {
    const now = new Date();

    return this.database.db.transaction(async (transaction) => {
      // Serialize hai request suggest cùng hangout để active set không bị trộn.
      await transaction.execute(
        sql`select ${hangouts.id} from ${hangouts} where ${hangouts.id} = ${hangoutId} for update`,
      );
      await transaction
        .update(suggestions)
        .set({ isActive: false, updatedAt: now })
        .where(eq(suggestions.hangoutId, hangoutId));

      if (places.length === 0) return new Map<string, string>();

      const placeRefs = await transaction
        .insert(providerPlaceRefs)
        .values(
          places.map((place) => ({
            provider: place.provider,
            externalPlaceId: place.externalId,
            lastVerifiedAt: now,
          })),
        )
        .onConflictDoUpdate({
          target: [providerPlaceRefs.provider, providerPlaceRefs.externalPlaceId],
          set: { lastVerifiedAt: now },
        })
        .returning({
          id: providerPlaceRefs.id,
          provider: providerPlaceRefs.provider,
          externalPlaceId: providerPlaceRefs.externalPlaceId,
        });
      const placeRefByKey = new Map(
        placeRefs.map((placeRef) => [
          `${placeRef.provider}:${placeRef.externalPlaceId}`,
          placeRef.id,
        ]),
      );

      const rows = await transaction
        .insert(suggestions)
        .values(
          places.map((place, index) => ({
            hangoutId,
            placeRefId: placeRefByKey.get(`${place.provider}:${place.externalId}`)!,
            rank: index + 1,
            isActive: true,
            updatedAt: now,
          })),
        )
        .onConflictDoUpdate({
          target: [suggestions.hangoutId, suggestions.placeRefId],
          set: { rank: sql`excluded.rank`, isActive: true, updatedAt: now },
        })
        .returning({ id: suggestions.id, placeRefId: suggestions.placeRefId });
      const keyByPlaceRef = new Map(
        [...placeRefByKey.entries()].map(([key, placeRefId]) => [placeRefId, key]),
      );

      return new Map(rows.map((row) => [keyByPlaceRef.get(row.placeRefId)!, row.id]));
    });
  }
}
