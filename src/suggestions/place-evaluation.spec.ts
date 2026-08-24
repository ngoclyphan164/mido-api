import { describe, expect, it } from 'vitest';

import type { PlaceCandidate } from '../places/places-provider';
import { evaluatePlaces, maximumPriceLevel, placeAvailabilityAt } from './place-evaluation';

const place: PlaceCandidate = {
  provider: 'fixture',
  externalId: 'place-1',
  name: 'Fixture Cafe',
  location: { lat: 10.77, lng: 106.7 },
  types: ['cafe'],
  utcOffsetMinutes: 420,
  regularOpeningHours: {
    periods: [
      {
        open: { day: 1, hour: 20, minute: 0 },
        close: { day: 2, hour: 2, minute: 0 },
      },
    ],
  },
};

describe('placeAvailabilityAt', () => {
  it('xử lý đúng timezone và khung giờ qua nửa đêm', () => {
    expect(placeAvailabilityAt(place, new Date('2026-08-24T18:00:00Z'))).toBe('open');
    expect(placeAvailabilityAt(place, new Date('2026-08-24T10:00:00Z'))).toBe('closed');
  });

  it('trả unknown nếu provider không có opening hours', () => {
    expect(placeAvailabilityAt({ ...place, regularOpeningHours: undefined }, new Date())).toBe(
      'unknown',
    );
  });
});

describe('evaluatePlaces', () => {
  it('lọc cứng quán đóng, quá budget và rating dưới ngưỡng', () => {
    const instant = new Date('2026-08-24T18:00:00Z');
    const candidates: PlaceCandidate[] = [
      { ...place, externalId: 'accepted', rating: 4.5, priceLevel: 1 },
      { ...place, externalId: 'expensive', rating: 4.5, priceLevel: 3 },
      { ...place, externalId: 'low-rating', rating: 3.2, priceLevel: 1 },
      { ...place, externalId: 'closed', businessStatus: 'CLOSED_TEMPORARILY' },
    ];

    expect(
      evaluatePlaces(candidates, instant, 120_000, 4).map(({ place }) => place.externalId),
    ).toEqual(['accepted']);
    expect(maximumPriceLevel(120_000)).toBe(1);
  });
});
