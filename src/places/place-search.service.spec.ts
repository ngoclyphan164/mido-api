import { Logger, ServiceUnavailableException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import { GoogleMapsHttpError } from '../providers/google-maps.client';
import type { LocationSearchProvider } from './location-search-provider';
import { PlaceSearchService } from './place-search.service';

describe('PlaceSearchService', () => {
  it('log lỗi quyền Google chi tiết nhưng chỉ trả message an toàn cho client', async () => {
    const upstreamError = new GoogleMapsHttpError(403, 'PERMISSION_DENIED: Places API (New)');
    const provider: LocationSearchProvider = {
      searchText: vi.fn().mockRejectedValue(upstreamError),
    };
    const logError = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const service = new PlaceSearchService(provider);

    const promise = service.search({ q: 'Landmark 81', limit: 5 });

    await expect(promise).rejects.toEqual(
      new ServiceUnavailableException('Dịch vụ tìm địa điểm chưa được Google cấp quyền'),
    );
    expect(logError).toHaveBeenCalledWith(expect.stringContaining('HTTP 403'));
  });

  it('trả attribution Google kèm tọa độ để client đặt pin', async () => {
    const provider: LocationSearchProvider = {
      searchText: vi.fn().mockResolvedValue({
        places: [
          {
            provider: 'google_maps',
            externalId: 'ChIJ-fixture-landmark',
            name: 'Landmark 81',
            address: '720A Điện Biên Phủ',
            location: { lat: 10.7949, lng: 106.7219 },
            primaryType: 'shopping_mall',
            types: ['shopping_mall'],
          },
        ],
      }),
    };
    const service = new PlaceSearchService(provider);

    await expect(service.search({ q: 'Landmark 81', limit: 5 })).resolves.toEqual({
      attribution: 'Powered by Google',
      places: [
        {
          provider: 'google_maps',
          placeId: 'ChIJ-fixture-landmark',
          name: 'Landmark 81',
          address: '720A Điện Biên Phủ',
          location: { lat: 10.7949, lng: 106.7219 },
          primaryType: 'shopping_mall',
          types: ['shopping_mall'],
          primaryTypeLabel: 'Trung tâm thương mại',
          typeLabels: ['Trung tâm thương mại'],
        },
      ],
    });
  });
});
