import { ConfigService } from '@nestjs/config';
import { describe, expect, it, vi } from 'vitest';

import routeMatrixFixture from '../../test/fixtures/google/route-matrix.json';
import type { GoogleMapsClient } from '../providers/google-maps.client';
import { GoogleRoutesProvider } from './google-routes.provider';
import type { RouteMatrixRequest } from './routing-provider';

const destinations = [
  { id: 'cafe-1', location: { lat: 10.7761, lng: 106.7009 } },
  { id: 'cafe-2', location: { lat: 10.78, lng: 106.695 } },
];

describe('GoogleRoutesProvider', () => {
  it('group origins theo travel mode và giữ đủ travel time cho từng cặp', async () => {
    const postJson = vi.fn().mockResolvedValue(routeMatrixFixture);
    const provider = new GoogleRoutesProvider(
      { postJson } as unknown as GoogleMapsClient,
      new ConfigService({ GOOGLE_ROUTES_DAILY_ELEMENT_LIMIT: 20 }),
    );
    const request: RouteMatrixRequest = {
      origins: [
        { id: 'nam', location: { lat: 10.77, lng: 106.68 }, mode: 'drive' },
        { id: 'linh', location: { lat: 10.79, lng: 106.72 }, mode: 'two_wheeler' },
      ],
      destinations,
      departureTime: new Date('2026-08-25T11:00:00Z'),
    };

    const result = await provider.computeRouteMatrix(request);

    expect(postJson).toHaveBeenCalledTimes(2);
    expect(result.elements).toHaveLength(4);
    expect(result.elements).toContainEqual({
      originId: 'nam',
      destinationId: 'cafe-1',
      mode: 'drive',
      status: 'ok',
      durationSec: 780,
      distanceMeters: 4200,
    });
    expect(result.storagePolicy.contentMayBeStored).toBe(false);

    const calls = postJson.mock.calls as [string, string, Record<string, unknown>][];
    expect(calls[0]?.[1]).toContain('status');
    expect(calls[0]?.[1]).not.toContain('*');
    expect(calls[0]?.[2]).toMatchObject({
      travelMode: 'TWO_WHEELER',
      routingPreference: 'TRAFFIC_AWARE',
    });
    expect(calls[1]?.[2]).toMatchObject({
      travelMode: 'DRIVE',
      routingPreference: 'TRAFFIC_AWARE',
    });
  });

  it('tự chia batch transit để không vượt trần 100 elements', async () => {
    const postJson = vi.fn().mockResolvedValue([]);
    const provider = new GoogleRoutesProvider(
      { postJson } as unknown as GoogleMapsClient,
      new ConfigService({ GOOGLE_ROUTES_DAILY_ELEMENT_LIMIT: 1_000 }),
    );
    const origins = Array.from({ length: 6 }, (_, index) => ({
      id: `member-${index}`,
      location: { lat: 10.7 + index * 0.001, lng: 106.7 },
      mode: 'transit' as const,
    }));
    const manyDestinations = Array.from({ length: 20 }, (_, index) => ({
      id: `place-${index}`,
      location: { lat: 10.75, lng: 106.7 + index * 0.001 },
    }));

    const result = await provider.computeRouteMatrix({
      origins,
      destinations: manyDestinations,
      departureTime: new Date('2026-08-25T11:00:00Z'),
    });

    expect(postJson).toHaveBeenCalledTimes(2);
    expect(result.elements).toHaveLength(120);
  });
});
