import { ConfigService } from '@nestjs/config';
import { describe, expect, it, vi } from 'vitest';

import nearbyFixture from '../../test/fixtures/google/nearby-search.json';
import type { GoogleMapsClient } from '../providers/google-maps.client';
import { GooglePlacesProvider } from './google-places.provider';

describe('GooglePlacesProvider', () => {
  it('gửi field mask tối thiểu, snap grid và map fixture thành candidate', async () => {
    const postJson = vi.fn().mockResolvedValue(nearbyFixture);
    const provider = new GooglePlacesProvider(
      { postJson } as unknown as GoogleMapsClient,
      new ConfigService({ GOOGLE_PLACES_DAILY_REQUEST_LIMIT: 10 }),
    );

    const result = await provider.searchNearby({
      center: { lat: 10.7756, lng: 106.7019 },
      radiusMeters: 1_500,
      includedTypes: ['cafe'],
    });

    expect(result.storagePolicy).toEqual({
      identityMayBeStored: true,
      contentMayBeStored: false,
    });
    expect(result.searchCell).toMatch(/^250:/);
    expect(result.places[0]).toMatchObject({
      externalId: 'ChIJ-fixture-cafe',
      name: 'Cà phê Fixture',
      priceLevel: 2,
      rating: 4.6,
    });

    expect(postJson).toHaveBeenCalledOnce();
    const [url, fieldMask, body] = postJson.mock.calls[0] as [string, string, object];
    expect(url).toBe('https://places.googleapis.com/v1/places:searchNearby');
    expect(fieldMask).toContain('places.id');
    expect(fieldMask).not.toContain('*');
    expect(body).toMatchObject({
      includedTypes: ['cafe'],
      maxResultCount: 20,
      languageCode: 'vi',
      regionCode: 'VN',
    });
  });

  it('từ chối request trước khi gọi Google nếu vượt giới hạn Nearby Search', async () => {
    const postJson = vi.fn();
    const provider = new GooglePlacesProvider(
      { postJson } as unknown as GoogleMapsClient,
      new ConfigService(),
    );

    await expect(
      provider.searchNearby({
        center: { lat: 10.77, lng: 106.7 },
        radiusMeters: 51_000,
        includedTypes: ['cafe'],
      }),
    ).rejects.toThrow(RangeError);
    expect(postJson).not.toHaveBeenCalled();
  });
});
