import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { z } from 'zod';

import {
  DailyProviderQuota,
  ProviderCircuitBreaker,
} from '../common/providers/provider-resilience';
import { GoogleMapsClient, GoogleMapsHttpError } from '../providers/google-maps.client';
import type { PlaceDetailsProvider } from './place-details-provider';
import type { PlaceCandidate } from './places-provider';

const GOOGLE_PLACE_DETAILS_BASE_URL = 'https://places.googleapis.com/v1/places/';
/**
 * Field mask quyết định SKU của Place Details, nên chỉ xin đúng những field màn
 * "Đã chốt" render. Không xin regularOpeningHours: giờ mở cửa đổi theo thời
 * gian, snapshot lưu lại chỉ sinh ra thông tin sai.
 */
const GOOGLE_PLACE_DETAILS_FIELD_MASK = [
  'id',
  'displayName',
  'formattedAddress',
  'location',
  'primaryType',
  'types',
  'rating',
  'userRatingCount',
  'priceLevel',
  'photos',
  'googleMapsUri',
].join(',');

/** Place ID của Google là chuỗi an toàn cho URL; chặn sớm để không ghép path lạ. */
const PLACE_ID_PATTERN = /^[A-Za-z0-9_-]{1,255}$/;

const placeDetailsSchema = z.object({
  id: z.string().min(1),
  displayName: z.object({ text: z.string().min(1), languageCode: z.string().optional() }),
  formattedAddress: z.string().min(1).optional(),
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
  googleMapsUri: z.string().url().optional(),
});

const priceLevels: Record<string, number> = {
  PRICE_LEVEL_FREE: 0,
  PRICE_LEVEL_INEXPENSIVE: 1,
  PRICE_LEVEL_MODERATE: 2,
  PRICE_LEVEL_EXPENSIVE: 3,
  PRICE_LEVEL_VERY_EXPENSIVE: 4,
};

@Injectable()
export class GooglePlaceDetailsProvider implements PlaceDetailsProvider {
  private readonly logger = new Logger(GooglePlaceDetailsProvider.name);
  private readonly quota: DailyProviderQuota;
  private readonly circuit: ProviderCircuitBreaker;
  private readonly languageCode: string;

  constructor(
    private readonly client: GoogleMapsClient,
    config: ConfigService,
  ) {
    this.quota = new DailyProviderQuota(
      'google-place-details-requests',
      config.get<number>('GOOGLE_PLACE_DETAILS_DAILY_REQUEST_LIMIT') ?? 500,
    );
    this.circuit = new ProviderCircuitBreaker(
      config.get<number>('GOOGLE_CIRCUIT_FAILURE_THRESHOLD') ?? 3,
      config.get<number>('GOOGLE_CIRCUIT_RESET_MS') ?? 30_000,
    );
    this.languageCode = config.get<string>('GOOGLE_PLACES_LANGUAGE_CODE') ?? 'vi';
  }

  async getDetails(externalPlaceId: string): Promise<PlaceCandidate | undefined> {
    if (!PLACE_ID_PATTERN.test(externalPlaceId)) return undefined;

    const url = new URL(`${GOOGLE_PLACE_DETAILS_BASE_URL}${externalPlaceId}`);
    url.searchParams.set('languageCode', this.languageCode);
    url.searchParams.set('regionCode', 'VN');

    try {
      const payload = await this.circuit.execute(
        () => {
          this.quota.consume(1);
          return this.client.getJsonWithFieldMask(url.toString(), GOOGLE_PLACE_DETAILS_FIELD_MASK);
        },
        (error) => error instanceof GoogleMapsHttpError && error.retryable,
      );

      return this.toCandidate(placeDetailsSchema.parse(payload));
    } catch (error) {
      if (error instanceof GoogleMapsHttpError && error.status === 404) return undefined;
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Could not read place details for ${externalPlaceId}: ${message}`);
      return undefined;
    }
  }

  private toCandidate(place: z.infer<typeof placeDetailsSchema>): PlaceCandidate {
    return {
      provider: 'google_maps',
      externalId: place.id,
      name: place.displayName.text,
      address: place.formattedAddress,
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
      mapsUri: place.googleMapsUri,
      googleMapsUri: place.googleMapsUri,
    };
  }
}
