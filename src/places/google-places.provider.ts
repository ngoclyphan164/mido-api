import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { z } from 'zod';

import {
  DailyProviderQuota,
  ProviderCircuitBreaker,
} from '../common/providers/provider-resilience';
import { GoogleMapsClient, GoogleMapsHttpError } from '../providers/google-maps.client';
import { snapToGrid } from '../providers/grid';
import type {
  NearbyPlacesQuery,
  NearbyPlacesResult,
  PlaceCandidate,
  PlacesProvider,
  ProviderStoragePolicy,
} from './places-provider';

const GOOGLE_PLACES_URL = 'https://places.googleapis.com/v1/places:searchNearby';
const GOOGLE_PLACES_FIELD_MASK = [
  'places.id',
  'places.displayName',
  'places.location',
  'places.primaryType',
  'places.types',
  'places.rating',
  'places.userRatingCount',
  'places.priceLevel',
  'places.photos',
  'places.regularOpeningHours',
  'places.googleMapsUri',
  'places.businessStatus',
  'places.utcOffsetMinutes',
].join(',');

const localizableTextSchema = z.object({
  text: z.string().min(1),
  languageCode: z.string().optional(),
});
const openingPointSchema = z.object({
  day: z.number().int().min(0).max(6),
  hour: z.number().int().min(0).max(23),
  minute: z.number().int().min(0).max(59),
});
const placeSchema = z.object({
  id: z.string().min(1),
  displayName: localizableTextSchema,
  location: z.object({
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180),
  }),
  primaryType: z.string().optional(),
  types: z.array(z.string()).default([]),
  rating: z.number().min(0).max(5).optional(),
  userRatingCount: z.number().int().nonnegative().optional(),
  priceLevel: z.string().optional(),
  photos: z
    .array(
      z.object({
        name: z.string().min(1),
        widthPx: z.number().int().positive().optional(),
        heightPx: z.number().int().positive().optional(),
        authorAttributions: z
          .array(z.object({ displayName: z.string().min(1) }).partial())
          .optional(),
      }),
    )
    .optional(),
  regularOpeningHours: z
    .object({
      periods: z
        .array(z.object({ open: openingPointSchema, close: openingPointSchema.optional() }))
        .optional(),
      weekdayDescriptions: z.array(z.string()).optional(),
    })
    .optional(),
  googleMapsUri: z.string().url().optional(),
  businessStatus: z.string().optional(),
  utcOffsetMinutes: z.number().int().min(-1_080).max(1_080).optional(),
});
const nearbyResponseSchema = z.object({ places: z.array(placeSchema).default([]) });

const priceLevels: Record<string, number> = {
  PRICE_LEVEL_FREE: 0,
  PRICE_LEVEL_INEXPENSIVE: 1,
  PRICE_LEVEL_MODERATE: 2,
  PRICE_LEVEL_EXPENSIVE: 3,
  PRICE_LEVEL_VERY_EXPENSIVE: 4,
};

export const GOOGLE_PLACES_STORAGE_POLICY: ProviderStoragePolicy = {
  identityMayBeStored: true,
  contentMayBeStored: false,
};

@Injectable()
export class GooglePlacesProvider implements PlacesProvider {
  private readonly quota: DailyProviderQuota;
  private readonly circuit: ProviderCircuitBreaker;

  constructor(
    private readonly client: GoogleMapsClient,
    config: ConfigService,
  ) {
    this.quota = new DailyProviderQuota(
      'google-places-requests',
      config.get<number>('GOOGLE_PLACES_DAILY_REQUEST_LIMIT') ?? 500,
    );
    this.circuit = new ProviderCircuitBreaker(
      config.get<number>('GOOGLE_CIRCUIT_FAILURE_THRESHOLD') ?? 3,
      config.get<number>('GOOGLE_CIRCUIT_RESET_MS') ?? 30_000,
    );
  }

  async searchNearby(query: NearbyPlacesQuery): Promise<NearbyPlacesResult> {
    this.validateQuery(query);
    const snapped = snapToGrid(query.center);

    const payload = await this.circuit.execute(
      () => {
        this.quota.consume(1);
        return this.client.postJson(GOOGLE_PLACES_URL, GOOGLE_PLACES_FIELD_MASK, {
          includedTypes: query.includedTypes,
          maxResultCount: query.maxResults ?? 20,
          rankPreference: query.rankPreference === 'distance' ? 'DISTANCE' : 'POPULARITY',
          languageCode: query.languageCode ?? 'vi',
          regionCode: query.regionCode ?? 'VN',
          locationRestriction: {
            circle: {
              center: {
                latitude: snapped.point.lat,
                longitude: snapped.point.lng,
              },
              radius: query.radiusMeters,
            },
          },
        });
      },
      (error) => error instanceof GoogleMapsHttpError && error.retryable,
    );
    const response = nearbyResponseSchema.parse(payload);

    return {
      places: response.places.map((place) => this.toCandidate(place)),
      snappedCenter: snapped.point,
      searchCell: snapped.cell,
      storagePolicy: GOOGLE_PLACES_STORAGE_POLICY,
    };
  }

  private validateQuery(query: NearbyPlacesQuery): void {
    if (
      !Number.isFinite(query.center.lat) ||
      query.center.lat < -90 ||
      query.center.lat > 90 ||
      !Number.isFinite(query.center.lng) ||
      query.center.lng < -180 ||
      query.center.lng > 180
    ) {
      throw new RangeError('center must be a valid latitude/longitude');
    }
    if (query.includedTypes.length < 1 || query.includedTypes.length > 50) {
      throw new RangeError('includedTypes must contain between 1 and 50 types');
    }
    if (query.radiusMeters <= 0 || query.radiusMeters > 50_000) {
      throw new RangeError('radiusMeters must be between 0 and 50000');
    }
    const maxResults = query.maxResults ?? 20;
    if (!Number.isInteger(maxResults) || maxResults < 1 || maxResults > 20) {
      throw new RangeError('maxResults must be between 1 and 20');
    }
  }

  private toCandidate(place: z.infer<typeof placeSchema>): PlaceCandidate {
    return {
      provider: 'google_maps',
      externalId: place.id,
      name: place.displayName.text,
      location: { lat: place.location.latitude, lng: place.location.longitude },
      primaryType: place.primaryType,
      types: place.types,
      rating: place.rating,
      userRatingCount: place.userRatingCount,
      priceLevel: place.priceLevel ? priceLevels[place.priceLevel] : undefined,
      photos: place.photos?.map((photo) => ({
        name: photo.name,
        widthPx: photo.widthPx,
        heightPx: photo.heightPx,
        attributions: photo.authorAttributions?.flatMap((author) =>
          author.displayName ? [author.displayName] : [],
        ),
      })),
      regularOpeningHours: place.regularOpeningHours,
      mapsUri: place.googleMapsUri,
      googleMapsUri: place.googleMapsUri,
      businessStatus: place.businessStatus,
      utcOffsetMinutes: place.utcOffsetMinutes,
    };
  }
}
