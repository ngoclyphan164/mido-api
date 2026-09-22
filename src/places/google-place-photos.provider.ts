import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { z } from 'zod';

import {
  DailyProviderQuota,
  ProviderCircuitBreaker,
} from '../common/providers/provider-resilience';
import { GoogleMapsClient, GoogleMapsHttpError } from '../providers/google-maps.client';
import type { PlacePhotoProvider } from './place-photo-provider';
import type { PlacePhotoRef } from './places-provider';

const GOOGLE_PLACES_BASE_URL = 'https://places.googleapis.com/v1/';
/** Resource name hợp lệ của Place Photo (New): `places/{place}/photos/{photo}`. */
const PHOTO_NAME_PATTERN = /^places\/[^/]+\/photos\/[^/]+$/;

const photoMediaResponseSchema = z.object({
  name: z.string().min(1).optional(),
  photoUri: z.string().url(),
});

@Injectable()
export class GooglePlacePhotosProvider implements PlacePhotoProvider {
  private readonly logger = new Logger(GooglePlacePhotosProvider.name);
  private readonly quota: DailyProviderQuota;
  private readonly circuit: ProviderCircuitBreaker;
  private readonly maxWidthPx: number;

  constructor(
    private readonly client: GoogleMapsClient,
    config: ConfigService,
  ) {
    this.quota = new DailyProviderQuota(
      'google-place-photo-requests',
      config.get<number>('GOOGLE_PLACE_PHOTO_DAILY_REQUEST_LIMIT') ?? 500,
    );
    this.circuit = new ProviderCircuitBreaker(
      config.get<number>('GOOGLE_CIRCUIT_FAILURE_THRESHOLD') ?? 3,
      config.get<number>('GOOGLE_CIRCUIT_RESET_MS') ?? 30_000,
    );
    this.maxWidthPx = config.get<number>('GOOGLE_PLACE_PHOTO_MAX_WIDTH_PX') ?? 800;
  }

  async resolvePhotoUri(photo: PlacePhotoRef): Promise<string | undefined> {
    if (!PHOTO_NAME_PATTERN.test(photo.name)) return undefined;

    try {
      const payload = await this.circuit.execute(
        () => {
          this.quota.consume(1);
          return this.client.getJson(`${GOOGLE_PLACES_BASE_URL}${photo.name}/media`, {
            maxWidthPx: this.maxWidthPx,
            // Lấy JSON kèm photoUri đã ký thay vì redirect, để không phải gắn
            // API key vào URL trả cho client.
            skipHttpRedirect: true,
          });
        },
        (error) => error instanceof GoogleMapsHttpError && error.retryable,
      );

      return photoMediaResponseSchema.parse(payload).photoUri;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Could not fetch the photo for ${photo.name}: ${message}`);
      return undefined;
    }
  }
}
