import { Injectable } from '@nestjs/common';
import { and, eq, inArray, sql } from 'drizzle-orm';

import { DatabaseService } from '../database/database.service';
import { geographyLat, geographyLng, toGeographyPoint } from '../database/geography';
import {
  groupMembers,
  hangouts,
  outings,
  providerPlaceRefs,
  suggestionPlaces,
  suggestions,
  votes,
} from '../database/schema';

const placeLat = geographyLat(suggestionPlaces.geog);
const placeLng = geographyLng(suggestionPlaces.geog);

export type StoredTravelTime = {
  participantId: string;
  name: string;
  durationSec: number;
  distanceMeters?: number;
  mode: string;
};

export type SuggestionSnapshotRow = {
  id: string;
  suggestionId: string;
  hangoutId: string;
  rank: number;
  isActive: boolean;
  provider: string;
  externalPlaceId: string;
  name: string;
  formattedAddress: string | null;
  lat: number;
  lng: number;
  primaryType: string | null;
  types: string[];
  rating: string | null;
  userRatingCount: number | null;
  priceLevel: number | null;
  mapsUri: string | null;
  photoNames: string[];
  photoUri: string | null;
  photoUriFetchedAt: Date | null;
  availability: string;
  score: string | null;
  scoreBreakdown: unknown;
  travelTimes: unknown;
  fetchedAt: Date;
};

export type SuggestionSnapshotInput = {
  suggestionId: string;
  provider: string;
  externalPlaceId: string;
  name: string;
  address?: string;
  location: { lat: number; lng: number };
  primaryType?: string;
  types: string[];
  rating?: number;
  userRatingCount?: number;
  priceLevel?: number;
  mapsUri?: string;
  photoNames: string[];
  /** URL đã ký mà `/suggest` vừa resolve — lưu luôn để lần đọc đầu khỏi gọi lại. */
  photoUri?: string;
  availability: string;
  score?: number;
  scoreBreakdown?: unknown;
  travelTimes: StoredTravelTime[];
};

export type VoteTally = { up: number; down: number; veto: number; total: number };

const selection = {
  id: suggestionPlaces.id,
  suggestionId: suggestionPlaces.suggestionId,
  hangoutId: suggestions.hangoutId,
  rank: suggestions.rank,
  isActive: suggestions.isActive,
  provider: suggestionPlaces.provider,
  externalPlaceId: suggestionPlaces.externalPlaceId,
  name: suggestionPlaces.name,
  formattedAddress: suggestionPlaces.formattedAddress,
  lat: placeLat,
  lng: placeLng,
  primaryType: suggestionPlaces.primaryType,
  types: suggestionPlaces.types,
  rating: suggestionPlaces.rating,
  userRatingCount: suggestionPlaces.userRatingCount,
  priceLevel: suggestionPlaces.priceLevel,
  mapsUri: suggestionPlaces.mapsUri,
  photoNames: suggestionPlaces.photoNames,
  photoUri: suggestionPlaces.photoUri,
  photoUriFetchedAt: suggestionPlaces.photoUriFetchedAt,
  availability: suggestionPlaces.availability,
  score: suggestionPlaces.score,
  scoreBreakdown: suggestionPlaces.scoreBreakdown,
  travelTimes: suggestionPlaces.travelTimes,
  fetchedAt: suggestionPlaces.fetchedAt,
};

@Injectable()
export class SuggestionSnapshotRepository {
  constructor(private readonly database: DatabaseService) {}

  async isHangoutMember(hangoutId: string, userId: string): Promise<boolean> {
    const [row] = await this.database.db
      .select({ id: hangouts.id })
      .from(hangouts)
      .innerJoin(
        groupMembers,
        and(eq(groupMembers.groupId, hangouts.groupId), eq(groupMembers.userId, userId)),
      )
      .where(eq(hangouts.id, hangoutId))
      .limit(1);

    return row !== undefined;
  }

  /**
   * Một trang option đang active, theo đúng thứ hạng lúc suggest. Phân trang ở
   * đây chứ không ở client: ảnh chỉ được resolve cho hàng thực sự trả về, nên
   * trả cả pool 20 sẽ tốn 20 request Place Photo cho 5 cái đang hiện.
   */
  async listActiveForHangout(
    hangoutId: string,
    offset = 0,
    limit = 5,
  ): Promise<SuggestionSnapshotRow[]> {
    return this.database.db
      .select(selection)
      .from(suggestionPlaces)
      .innerJoin(suggestions, eq(suggestions.id, suggestionPlaces.suggestionId))
      .where(and(eq(suggestions.hangoutId, hangoutId), eq(suggestions.isActive, true)))
      .orderBy(suggestions.rank)
      .offset(offset)
      .limit(limit);
  }

  /** Tổng số option đang active, để client biết khi nào phải quay vòng. */
  async countActiveForHangout(hangoutId: string): Promise<number> {
    const [row] = await this.database.db
      .select({ total: sql<number>`count(*)::int` })
      .from(suggestionPlaces)
      .innerJoin(suggestions, eq(suggestions.id, suggestionPlaces.suggestionId))
      .where(and(eq(suggestions.hangoutId, hangoutId), eq(suggestions.isActive, true)));

    return row?.total ?? 0;
  }

  async findBySuggestion(suggestionId: string): Promise<SuggestionSnapshotRow | undefined> {
    const [row] = await this.database.db
      .select(selection)
      .from(suggestionPlaces)
      .innerJoin(suggestions, eq(suggestions.id, suggestionPlaces.suggestionId))
      .where(eq(suggestionPlaces.suggestionId, suggestionId))
      .limit(1);

    return row;
  }

  /** Snapshot của option đã chốt, kể cả khi nó đã bị đánh dấu không còn active. */
  async findChosenForHangout(hangoutId: string): Promise<SuggestionSnapshotRow | undefined> {
    const [row] = await this.database.db
      .select(selection)
      .from(outings)
      .innerJoin(suggestions, eq(suggestions.id, outings.chosenSuggestionId))
      .innerJoin(suggestionPlaces, eq(suggestionPlaces.suggestionId, suggestions.id))
      .where(eq(outings.hangoutId, hangoutId))
      .limit(1);

    return row;
  }

  /**
   * Outing + place ID của option đã chốt, dùng khi kèo được chốt từ trước lúc
   * bảng snapshot tồn tại nên phải đọc lại nội dung từ provider.
   */
  async findChosenPlaceRef(
    hangoutId: string,
  ): Promise<{ suggestionId: string; provider: string; externalPlaceId: string } | undefined> {
    const [row] = await this.database.db
      .select({
        suggestionId: suggestions.id,
        provider: providerPlaceRefs.provider,
        externalPlaceId: providerPlaceRefs.externalPlaceId,
      })
      .from(outings)
      .innerJoin(suggestions, eq(suggestions.id, outings.chosenSuggestionId))
      .innerJoin(providerPlaceRefs, eq(providerPlaceRefs.id, suggestions.placeRefId))
      .where(eq(outings.hangoutId, hangoutId))
      .limit(1);

    return row;
  }

  async saveMany(inputs: SuggestionSnapshotInput[]): Promise<void> {
    if (inputs.length === 0) return;

    const now = new Date();
    const values = inputs.map((input) => ({
      suggestionId: input.suggestionId,
      provider: input.provider,
      externalPlaceId: input.externalPlaceId,
      name: input.name,
      formattedAddress: input.address ?? null,
      geog: toGeographyPoint(input.location),
      primaryType: input.primaryType ?? null,
      types: input.types,
      rating: input.rating === undefined ? null : input.rating.toFixed(2),
      userRatingCount: input.userRatingCount ?? null,
      priceLevel: input.priceLevel ?? null,
      mapsUri: input.mapsUri ?? null,
      photoNames: input.photoNames,
      photoUri: input.photoUri ?? null,
      photoUriFetchedAt: input.photoUri === undefined ? null : now,
      availability: input.availability,
      score: input.score === undefined ? null : input.score.toFixed(4),
      scoreBreakdown: input.scoreBreakdown ?? null,
      travelTimes: input.travelTimes,
      fetchedAt: now,
    }));

    await this.database.db
      .insert(suggestionPlaces)
      .values(values)
      .onConflictDoUpdate({
        target: suggestionPlaces.suggestionId,
        set: {
          name: sql`excluded.name`,
          formattedAddress: sql`excluded.formatted_address`,
          geog: sql`excluded.geog`,
          primaryType: sql`excluded.primary_type`,
          types: sql`excluded.types`,
          rating: sql`excluded.rating`,
          userRatingCount: sql`excluded.user_rating_count`,
          priceLevel: sql`excluded.price_level`,
          mapsUri: sql`excluded.maps_uri`,
          photoNames: sql`excluded.photo_names`,
          photoUri: sql`excluded.photo_uri`,
          photoUriFetchedAt: sql`excluded.photo_uri_fetched_at`,
          availability: sql`excluded.availability`,
          score: sql`excluded.score`,
          scoreBreakdown: sql`excluded.score_breakdown`,
          travelTimes: sql`excluded.travel_times`,
          fetchedAt: sql`excluded.fetched_at`,
        },
      });
  }

  /** URL ảnh đã ký là thứ duy nhất trong bảng này có hạn dùng. */
  async savePhotoUri(snapshotId: string, photoUri: string | null): Promise<void> {
    await this.database.db
      .update(suggestionPlaces)
      .set({ photoUri, photoUriFetchedAt: new Date() })
      .where(eq(suggestionPlaces.id, snapshotId));
  }

  /** Tally theo từng suggestion, để mở lại app vẫn thấy nhóm đã vote gì. */
  async tallies(suggestionIds: string[]): Promise<Map<string, VoteTally>> {
    if (suggestionIds.length === 0) return new Map();

    const rows = await this.database.db
      .select({
        suggestionId: votes.suggestionId,
        value: votes.value,
        count: sql<number>`count(*)::int`,
      })
      .from(votes)
      .where(inArray(votes.suggestionId, suggestionIds))
      .groupBy(votes.suggestionId, votes.value);

    const tallies = new Map<string, VoteTally>();
    for (const row of rows) {
      const tally = tallies.get(row.suggestionId) ?? { up: 0, down: 0, veto: 0, total: 0 };
      if (row.value === 'up' || row.value === 'down' || row.value === 'veto') {
        tally[row.value] += row.count;
      }
      tally.total += row.count;
      tallies.set(row.suggestionId, tally);
    }

    return tallies;
  }
}
