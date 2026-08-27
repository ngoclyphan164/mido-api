import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { z } from 'zod';

import {
  DailyProviderQuota,
  ProviderCircuitBreaker,
} from '../common/providers/provider-resilience';
import { GoogleMapsClient, GoogleMapsHttpError } from '../providers/google-maps.client';
import type {
  LocationSearchCandidate,
  LocationSearchProvider,
  LocationSearchQuery,
  LocationSearchResult,
} from './location-search-provider';

const GOOGLE_TEXT_SEARCH_URL = 'https://places.googleapis.com/v1/places:searchText';
const GOOGLE_TEXT_SEARCH_FIELD_MASK = [
  'places.id',
  'places.displayName',
  'places.formattedAddress',
  'places.location',
  'places.primaryType',
  'places.types',
].join(',');

const DEFAULT_RADIUS_METERS = 50_000;

const placeSchema = z.object({
  id: z.string().min(1),
  displayName: z.object({ text: z.string().min(1), languageCode: z.string().optional() }),
  formattedAddress: z.string().min(1).optional(),
  location: z.object({
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180),
  }),
  primaryType: z.string().optional(),
  types: z.array(z.string()).default([]),
});
const textSearchResponseSchema = z.object({ places: z.array(placeSchema).default([]) });

@Injectable()
export class GoogleTextSearchProvider implements LocationSearchProvider {
  private readonly quota: DailyProviderQuota;
  private readonly circuit: ProviderCircuitBreaker;

  constructor(
    private readonly client: GoogleMapsClient,
    config: ConfigService,
  ) {
    this.quota = new DailyProviderQuota(
      'google-text-search-requests',
      config.get<number>('GOOGLE_TEXT_SEARCH_DAILY_REQUEST_LIMIT') ?? 500,
    );
    this.circuit = new ProviderCircuitBreaker(
      config.get<number>('GOOGLE_CIRCUIT_FAILURE_THRESHOLD') ?? 3,
      config.get<number>('GOOGLE_CIRCUIT_RESET_MS') ?? 30_000,
    );
  }

  async searchText(query: LocationSearchQuery): Promise<LocationSearchResult> {
    this.validateQuery(query);
    const maxResults = query.maxResults ?? 5;

    const body: Record<string, unknown> = {
      textQuery: query.text.trim(),
      languageCode: query.languageCode ?? 'vi',
      regionCode: 'VN',
      pageSize: maxResults,
    };
    if (query.center) {
      // locationBias chứ không phải locationRestriction: gõ tên quán ở tỉnh khác
      // vẫn ra kết quả, chỉ là bị xếp sau các kết quả quanh vị trí hiện tại.
      body.locationBias = {
        circle: {
          center: { latitude: query.center.lat, longitude: query.center.lng },
          radius: query.radiusMeters ?? DEFAULT_RADIUS_METERS,
        },
      };
    }

    const payload = await this.circuit.execute(
      () => {
        this.quota.consume(1);
        return this.client.postJson(GOOGLE_TEXT_SEARCH_URL, GOOGLE_TEXT_SEARCH_FIELD_MASK, body);
      },
      (error) => error instanceof GoogleMapsHttpError && error.retryable,
    );
    const response = textSearchResponseSchema.parse(payload);

    return {
      places: response.places.slice(0, maxResults).map((place) => this.toCandidate(place)),
    };
  }

  private validateQuery(query: LocationSearchQuery): void {
    const textLength = query.text.trim().length;
    if (textLength < 2 || textLength > 200) {
      throw new RangeError('text must contain between 2 and 200 characters');
    }

    const maxResults = query.maxResults ?? 5;
    if (!Number.isInteger(maxResults) || maxResults < 1 || maxResults > 10) {
      throw new RangeError('maxResults must be between 1 and 10');
    }

    if (!query.center) {
      if (query.radiusMeters !== undefined) throw new RangeError('radiusMeters requires a center');
      return;
    }

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

    const radiusMeters = query.radiusMeters ?? DEFAULT_RADIUS_METERS;
    if (!Number.isFinite(radiusMeters) || radiusMeters <= 0 || radiusMeters > 50_000) {
      throw new RangeError('radiusMeters must be between 0 and 50000');
    }
  }

  private toCandidate(place: z.infer<typeof placeSchema>): LocationSearchCandidate {
    return {
      provider: 'google_maps',
      externalId: place.id,
      name: place.displayName.text,
      address: place.formattedAddress,
      location: { lat: place.location.latitude, lng: place.location.longitude },
      primaryType: place.primaryType,
      types: place.types,
    };
  }
}
