import { describe, expect, it } from 'vitest';

import { toGeographyPoint } from './geography';

describe('toGeographyPoint', () => {
  it('đảo lat/lng sang thứ tự longitude/latitude của PostGIS', () => {
    expect(toGeographyPoint({ lat: 10.7769, lng: 106.7009 })).toBe(
      'SRID=4326;POINT(106.7009 10.7769)',
    );
  });

  it.each([
    { lat: 91, lng: 0 },
    { lat: 0, lng: -181 },
    { lat: Number.NaN, lng: 0 },
  ])('từ chối coordinate ngoài miền hợp lệ: $lat, $lng', (coordinate) => {
    expect(() => toGeographyPoint(coordinate)).toThrow(RangeError);
  });
});
