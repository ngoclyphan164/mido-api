import { ConfigService } from '@nestjs/config';
import { Logger } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import placePhotoFixture from '../../test/fixtures/google/place-photo.json';
import { GoogleMapsHttpError } from '../providers/google-maps.client';
import type { GoogleMapsClient } from '../providers/google-maps.client';
import { GooglePlacePhotosProvider } from './google-place-photos.provider';

const photo = { name: 'places/ChIJ-fixture-cafe/photos/AeeoHcK-fixture' };

describe('GooglePlacePhotosProvider', () => {
  it('đổi photo reference thành URL không kèm API key', async () => {
    const getJson = vi.fn().mockResolvedValue(placePhotoFixture);
    const provider = new GooglePlacePhotosProvider(
      { getJson } as unknown as GoogleMapsClient,
      new ConfigService({ GOOGLE_PLACE_PHOTO_MAX_WIDTH_PX: 1_200 }),
    );

    await expect(provider.resolvePhotoUri(photo)).resolves.toBe(
      'https://lh3.googleusercontent.com/places/fixture-cafe-cover=s800',
    );
    expect(getJson).toHaveBeenCalledWith(
      'https://places.googleapis.com/v1/places/ChIJ-fixture-cafe/photos/AeeoHcK-fixture/media',
      { maxWidthPx: 1_200, skipHttpRedirect: true },
    );
  });

  it('trả undefined thay vì làm hỏng /suggest khi Google lỗi', async () => {
    vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const getJson = vi.fn().mockRejectedValue(new GoogleMapsHttpError(500, 'boom'));
    const provider = new GooglePlacePhotosProvider(
      { getJson } as unknown as GoogleMapsClient,
      new ConfigService(),
    );

    await expect(provider.resolvePhotoUri(photo)).resolves.toBeUndefined();
  });

  it('từ chối resource name lạ trước khi gọi Google', async () => {
    const getJson = vi.fn();
    const provider = new GooglePlacePhotosProvider(
      { getJson } as unknown as GoogleMapsClient,
      new ConfigService(),
    );

    await expect(provider.resolvePhotoUri({ name: '../../v1/places:searchText' })).resolves.toBe(
      undefined,
    );
    expect(getJson).not.toHaveBeenCalled();
  });
});
