import { ConfigService } from '@nestjs/config';
import { describe, expect, it, vi } from 'vitest';

import textSearchFixture from '../../test/fixtures/google/text-search.json';
import type { GoogleMapsClient } from '../providers/google-maps.client';
import { GoogleTextSearchProvider } from './google-text-search.provider';

describe('GoogleTextSearchProvider', () => {
  it('gọi Text Search (New) với field mask tối thiểu và map fixture về candidate', async () => {
    const postJson = vi.fn().mockResolvedValue(textSearchFixture);
    const provider = new GoogleTextSearchProvider(
      { postJson } as unknown as GoogleMapsClient,
      new ConfigService({ GOOGLE_TEXT_SEARCH_DAILY_REQUEST_LIMIT: 10 }),
    );

    const result = await provider.searchText({
      text: 'Landmark 81',
      center: { lat: 10.7769, lng: 106.7009 },
      radiusMeters: 20_000,
      maxResults: 5,
    });

    expect(result.places[0]).toEqual({
      provider: 'google_maps',
      externalId: 'ChIJ-fixture-landmark',
      name: 'Landmark 81',
      address: '720A Điện Biên Phủ, Bình Thạnh, Thành phố Hồ Chí Minh, Việt Nam',
      location: { lat: 10.7949, lng: 106.7219 },
      primaryType: 'shopping_mall',
      types: ['shopping_mall', 'point_of_interest', 'establishment'],
    });

    const [url, fieldMask, body] = postJson.mock.calls[0] as [string, string, object];
    expect(url).toBe('https://places.googleapis.com/v1/places:searchText');
    expect(fieldMask).toContain('places.formattedAddress');
    expect(fieldMask).not.toContain('*');
    expect(body).toEqual({
      textQuery: 'Landmark 81',
      languageCode: 'vi',
      regionCode: 'VN',
      pageSize: 5,
      locationBias: {
        circle: { center: { latitude: 10.7769, longitude: 106.7009 }, radius: 20_000 },
      },
    });
  });

  it('cắt kết quả theo maxResults và bỏ locationBias khi không có center', async () => {
    const postJson = vi.fn().mockResolvedValue(textSearchFixture);
    const provider = new GoogleTextSearchProvider(
      { postJson } as unknown as GoogleMapsClient,
      new ConfigService(),
    );

    const result = await provider.searchText({ text: 'Landmark 81', maxResults: 1 });

    expect(result.places).toHaveLength(1);
    const [, , body] = postJson.mock.calls[0] as [string, string, Record<string, unknown>];
    expect(body.locationBias).toBeUndefined();
  });

  it('map response rỗng thành danh sách rỗng thay vì ném lỗi', async () => {
    const postJson = vi.fn().mockResolvedValue({});
    const provider = new GoogleTextSearchProvider(
      { postJson } as unknown as GoogleMapsClient,
      new ConfigService(),
    );

    await expect(provider.searchText({ text: 'không tồn tại' })).resolves.toEqual({ places: [] });
  });

  it('từ chối query không hợp lệ trước khi gọi Google', async () => {
    const postJson = vi.fn();
    const provider = new GoogleTextSearchProvider(
      { postJson } as unknown as GoogleMapsClient,
      new ConfigService(),
    );

    await expect(provider.searchText({ text: 'x' })).rejects.toThrow(RangeError);
    await expect(provider.searchText({ text: 'quán cà phê', radiusMeters: 1_000 })).rejects.toThrow(
      'radiusMeters requires a center',
    );
    expect(postJson).not.toHaveBeenCalled();
  });
});
