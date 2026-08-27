import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { describe, expect, it, vi } from 'vitest';

import placeDetailsFixture from '../../test/fixtures/google/place-details.json';
import { GoogleMapsHttpError } from '../providers/google-maps.client';
import type { GoogleMapsClient } from '../providers/google-maps.client';
import { GooglePlaceDetailsProvider } from './google-place-details.provider';

function providerWith(getJsonWithFieldMask: ReturnType<typeof vi.fn>) {
  return new GooglePlaceDetailsProvider(
    { getJsonWithFieldMask } as unknown as GoogleMapsClient,
    new ConfigService(),
  );
}

describe('GooglePlaceDetailsProvider', () => {
  it('đọc lại nội dung place từ ID đã lưu', async () => {
    const getJsonWithFieldMask = vi.fn().mockResolvedValue(placeDetailsFixture);

    await expect(
      providerWith(getJsonWithFieldMask).getDetails('ChIJ-fixture-cafe'),
    ).resolves.toMatchObject({
      provider: 'google_maps',
      externalId: 'ChIJ-fixture-cafe',
      name: 'Cà phê Fixture',
      address: '12 Nguyễn Huệ, Bến Nghé, Quận 1, TP.HCM',
      location: { lat: 10.7761, lng: 106.7009 },
      priceLevel: 2,
      photos: [
        expect.objectContaining({ name: 'places/ChIJ-fixture-cafe/photos/AeeoHcK-fixture' }),
      ],
    });

    const [url, fieldMask] = getJsonWithFieldMask.mock.calls[0]!;
    expect(url).toContain('https://places.googleapis.com/v1/places/ChIJ-fixture-cafe');
    expect(url).toContain('languageCode=vi');
    // Field mask quyết định SKU: xin thừa field là tự tăng giá mỗi lần chốt kèo.
    expect(fieldMask).not.toContain('regularOpeningHours');
  });

  it('trả undefined khi place ID không còn tồn tại', async () => {
    const getJsonWithFieldMask = vi.fn().mockRejectedValue(new GoogleMapsHttpError(404, 'gone'));

    await expect(
      providerWith(getJsonWithFieldMask).getDetails('ChIJ-fixture-cafe'),
    ).resolves.toBeUndefined();
  });

  it('không làm hỏng luồng chốt kèo khi Google lỗi', async () => {
    vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const getJsonWithFieldMask = vi.fn().mockRejectedValue(new GoogleMapsHttpError(500, 'boom'));

    await expect(
      providerWith(getJsonWithFieldMask).getDetails('ChIJ-fixture-cafe'),
    ).resolves.toBeUndefined();
  });

  it('từ chối place ID lạ trước khi ghép vào URL', async () => {
    const getJsonWithFieldMask = vi.fn();

    await expect(
      providerWith(getJsonWithFieldMask).getDetails('../../places:searchText'),
    ).resolves.toBeUndefined();
    expect(getJsonWithFieldMask).not.toHaveBeenCalled();
  });
});
