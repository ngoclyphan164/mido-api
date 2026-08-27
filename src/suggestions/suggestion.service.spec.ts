import { describe, expect, it, vi } from 'vitest';

import { haversineMeters } from '../midpoint/geometry';
import type { PlacePhotoProvider } from '../places/place-photo-provider';
import type { PlacesProvider } from '../places/places-provider';
import type { RoutingProvider } from '../routing/routing-provider';
import type { HangoutSuggestionContext, SuggestionRepository } from './suggestion.repository';
import type { SuggestionSnapshotRepository } from './suggestion-snapshot.repository';
import { SuggestionService } from './suggestion.service';

function createPhotoProvider(uri?: string): PlacePhotoProvider {
  return { resolvePhotoUri: vi.fn().mockResolvedValue(uri) };
}

const context: HangoutSuggestionContext = {
  id: '68f9bef5-a143-45a5-bab3-4f54e3a216f6',
  activityType: 'cà phê',
  plannedAt: new Date('2026-08-25T11:00:00Z'),
  fairnessMode: 'BALANCED',
  timeCapSeconds: 600,
  status: 'draft',
  participants: [
    {
      id: '9dd86c50-a225-4a1e-a4a8-2e9d06758612',
      userId: '3f8f2c43-b10d-4cd0-92d8-cc40ef58a0e8',
      name: 'Nam',
      origin: { lat: 10.7756, lng: 106.7019 },
      mode: 'two_wheeler',
      weight: 1,
      fairnessDebtSeconds: 0,
    },
    {
      id: '92ce6811-74ae-44d7-9ce8-a5f8d4b8be73',
      userId: '5c5b5cc0-0247-43e4-9460-7e726c6289bc',
      name: 'Linh',
      origin: { lat: 10.7844, lng: 106.6844 },
      mode: 'drive',
      weight: 1,
      fairnessDebtSeconds: 0,
    },
  ],
};

function createRepository(currentContext: HangoutSuggestionContext | undefined = context) {
  return {
    loadContext: vi.fn().mockResolvedValue(currentContext),
    syncActiveSuggestions: vi
      .fn()
      .mockImplementation(
        (_hangoutId: string, places: Array<{ provider: string; externalId: string }>) =>
          Promise.resolve(
            new Map(
              places.map((place, index) => [
                `${place.provider}:${place.externalId}`,
                `suggestion-${index + 1}`,
              ]),
            ),
          ),
      ),
  };
}

/** `/suggest` ghi snapshot sau khi build response; các test dưới đây chỉ quan tâm response. */
function snapshotStub() {
  return { saveMany: vi.fn() } as unknown as SuggestionSnapshotRepository;
}

describe('SuggestionService', () => {
  it('trả travelTimes đầy đủ, bỏ candidate thiếu route và relax cap khi cần', async () => {
    const repository = createRepository();
    const placesProvider: PlacesProvider = {
      searchNearby: vi.fn().mockResolvedValue({
        snappedCenter: { lat: 10.78, lng: 106.69 },
        searchCell: '250:fixture',
        storagePolicy: { identityMayBeStored: true, contentMayBeStored: false },
        places: [
          {
            provider: 'google_maps',
            externalId: 'cafe-complete',
            name: 'Cafe Complete',
            location: { lat: 10.78, lng: 106.695 },
            primaryType: 'cafe',
            types: ['cafe'],
            rating: 4.6,
            userRatingCount: 200,
            photos: [{ name: 'places/cafe-complete/photos/fixture' }],
            mapsUri: 'https://maps.google.com/?cid=cafe-complete',
          },
          {
            provider: 'google_maps',
            externalId: 'cafe-missing-route',
            name: 'Cafe Missing',
            location: { lat: 10.781, lng: 106.696 },
            types: ['cafe'],
          },
        ],
      }),
    };
    const completeKey = 'google_maps:cafe-complete';
    const incompleteKey = 'google_maps:cafe-missing-route';
    const routingProvider: RoutingProvider = {
      computeRouteMatrix: vi.fn().mockResolvedValue({
        storagePolicy: { contentMayBeStored: false },
        elements: [
          {
            originId: context.participants[0]!.id,
            destinationId: completeKey,
            mode: 'two_wheeler',
            status: 'ok',
            durationSec: 700,
            distanceMeters: 4_000,
          },
          {
            originId: context.participants[1]!.id,
            destinationId: completeKey,
            mode: 'drive',
            status: 'ok',
            durationSec: 800,
            distanceMeters: 5_000,
          },
          {
            originId: context.participants[0]!.id,
            destinationId: incompleteKey,
            mode: 'two_wheeler',
            status: 'ok',
            durationSec: 500,
          },
        ],
      }),
    };
    const resolvePhotoUri = vi
      .fn<PlacePhotoProvider['resolvePhotoUri']>()
      .mockResolvedValue('https://lh3.googleusercontent.com/cafe=s800');
    const service = new SuggestionService(
      repository as unknown as SuggestionRepository,
      placesProvider,
      routingProvider,
      { resolvePhotoUri },
      snapshotStub(),
    );

    const result = await service.suggest(context.id, 'user-id', { topN: 5 });

    expect(result.status).toBe('ok');
    expect(result.meta).toMatchObject({ capRelaxed: true, placesRouted: 1 });
    expect(result.suggestions).toHaveLength(1);
    expect(result.suggestions[0]?.travelTimes).toHaveLength(2);
    expect(result.suggestions[0]?.travelTimes.map((travel) => travel.name)).toEqual([
      'Nam',
      'Linh',
    ]);
    expect(result.suggestions[0]?.suggestionId).toBe('suggestion-1');
    expect(result.suggestions[0]?.mapsUri).toBe('https://maps.google.com/?cid=cafe-complete');
    expect(repository.syncActiveSuggestions).toHaveBeenCalledOnce();

    // Chỉ candidate được trả về client mới tốn call Place Photo, candidate bị
    // loại vì thiếu route thì không.
    expect(result.suggestions[0]?.images).toEqual(['https://lh3.googleusercontent.com/cafe=s800']);
    expect(resolvePhotoUri).toHaveBeenCalledOnce();
    expect(resolvePhotoUri).toHaveBeenCalledWith({ name: 'places/cafe-complete/photos/fixture' });
  });

  it('trả nguyên pool khi topN bằng số candidate, để client tự xoay vòng "suggest lại"', async () => {
    // `/suggest` deterministic, gọi lại chỉ tốn tiền Google mà ra y hệt kết quả.
    // Route Matrix đã tính cho cả pool rồi nên trả hết ra là gần như miễn phí.
    const poolSize = 12;
    const places = Array.from({ length: poolSize }, (_, index) => ({
      provider: 'google_maps',
      externalId: `cafe-${index}`,
      name: `Cafe ${index}`,
      location: { lat: 10.78 + index * 0.001, lng: 106.695 },
      primaryType: 'cafe',
      types: ['cafe'],
      rating: 4 + (index % 5) / 10,
      userRatingCount: 100 + index,
      photos: [{ name: `places/cafe-${index}/photos/fixture` }],
    }));
    const repository = createRepository();
    const searchNearby = vi.fn<PlacesProvider['searchNearby']>().mockResolvedValue({
      snappedCenter: { lat: 10.78, lng: 106.69 },
      searchCell: '250:fixture',
      storagePolicy: { identityMayBeStored: true, contentMayBeStored: false },
      places,
    });
    const computeRouteMatrix = vi.fn<RoutingProvider['computeRouteMatrix']>().mockResolvedValue({
      storagePolicy: { contentMayBeStored: false },
      elements: context.participants.flatMap((participant) =>
        places.map((place, index) => ({
          originId: participant.id,
          destinationId: `google_maps:${place.externalId}`,
          mode: participant.mode,
          status: 'ok' as const,
          durationSec: 400 + index * 5,
        })),
      ),
    });
    const resolvePhotoUri = vi
      .fn<PlacePhotoProvider['resolvePhotoUri']>()
      .mockImplementation((photo) =>
        Promise.resolve(`https://lh3.googleusercontent.com/${photo.name}`),
      );
    const service = new SuggestionService(
      repository as unknown as SuggestionRepository,
      { searchNearby },
      { computeRouteMatrix },
      { resolvePhotoUri },
      snapshotStub(),
    );

    const result = await service.suggest(context.id, 'user-id', { topN: poolSize });

    expect(result.suggestions).toHaveLength(poolSize);
    expect(new Set(result.suggestions.map((suggestion) => suggestion.id)).size).toBe(poolSize);
    expect(result.suggestions.every((suggestion) => suggestion.images.length === 1)).toBe(true);
    // Một lần /suggest, một call Place Photo cho mỗi option trả về.
    expect(resolvePhotoUri).toHaveBeenCalledTimes(poolSize);
    expect(searchNearby).toHaveBeenCalledOnce();
    expect(computeRouteMatrix).toHaveBeenCalledOnce();
  });

  it('vẫn trả suggestion khi Place Photo không lấy được ảnh', async () => {
    const repository = createRepository();
    const placesProvider: PlacesProvider = {
      searchNearby: vi.fn().mockResolvedValue({
        snappedCenter: { lat: 10.78, lng: 106.69 },
        searchCell: '250:fixture',
        storagePolicy: { identityMayBeStored: true, contentMayBeStored: false },
        places: [
          {
            provider: 'google_maps',
            externalId: 'cafe-1',
            name: 'Cafe 1',
            location: { lat: 10.78, lng: 106.695 },
            types: ['cafe'],
            photos: [{ name: 'places/cafe-1/photos/fixture' }],
          },
        ],
      }),
    };
    const routingProvider: RoutingProvider = {
      computeRouteMatrix: vi.fn().mockResolvedValue({
        storagePolicy: { contentMayBeStored: false },
        elements: context.participants.map((participant) => ({
          originId: participant.id,
          destinationId: 'google_maps:cafe-1',
          mode: participant.mode,
          status: 'ok',
          durationSec: 500,
        })),
      }),
    };
    const service = new SuggestionService(
      repository as unknown as SuggestionRepository,
      placesProvider,
      routingProvider,
      createPhotoProvider(undefined),
      snapshotStub(),
    );

    const result = await service.suggest(context.id, 'user-id', { topN: 5 });

    expect(result.suggestions).toHaveLength(1);
    expect(result.suggestions[0]?.images).toEqual([]);
  });

  it('không gọi provider tính phí khi nhóm quá phân tán', async () => {
    const repository = createRepository({
      ...context,
      participants: [
        ...context.participants,
        {
          ...context.participants[0]!,
          id: '6a1d087e-eb7a-48f5-8f99-9fdf678932bd',
          name: 'Hà Nội 1',
          origin: { lat: 21.0278, lng: 105.8342 },
        },
        {
          ...context.participants[1]!,
          id: 'f79ad78c-31a1-4e6f-9ef4-a7cdf14641f5',
          name: 'Hà Nội 2',
          origin: { lat: 21.03, lng: 105.84 },
        },
      ],
    });
    const searchNearby = vi.fn();
    const computeRouteMatrix = vi.fn();
    const placesProvider: PlacesProvider = { searchNearby };
    const routingProvider: RoutingProvider = { computeRouteMatrix };
    const service = new SuggestionService(
      repository as unknown as SuggestionRepository,
      placesProvider,
      routingProvider,
      createPhotoProvider(),
      snapshotStub(),
    );

    const result = await service.suggest(context.id, 'user-id', { topN: 5 });

    expect(result.status).toBe('split_recommended');
    expect(result.splitSuggestion?.clusters).toHaveLength(2);
    expect(searchNearby).not.toHaveBeenCalled();
    expect(computeRouteMatrix).not.toHaveBeenCalled();
  });

  it('kéo search seed về phía participant đang có fairness debt dương', async () => {
    const indebtedContext: HangoutSuggestionContext = {
      ...context,
      participants: [
        { ...context.participants[0]!, fairnessDebtSeconds: 3_600 },
        { ...context.participants[1]!, fairnessDebtSeconds: -3_600 },
      ],
    };
    const repository = createRepository(indebtedContext);
    const searchNearby = vi.fn<PlacesProvider['searchNearby']>().mockResolvedValue({
      snappedCenter: indebtedContext.participants[0]!.origin,
      searchCell: '250:debt-test',
      storagePolicy: { identityMayBeStored: true, contentMayBeStored: false },
      places: [],
    });
    const service = new SuggestionService(
      repository as unknown as SuggestionRepository,
      { searchNearby },
      { computeRouteMatrix: vi.fn() },
      createPhotoProvider(),
      snapshotStub(),
    );

    const result = await service.suggest(context.id, 'user-id', { topN: 5 });
    const request = searchNearby.mock.calls[0]?.[0];
    if (!request) throw new Error('Places provider was not called');

    expect(haversineMeters(request.center, indebtedContext.participants[0]!.origin)).toBeLessThan(
      1,
    );
    expect(result.meta.fairness.participants).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          participantId: indebtedContext.participants[0]!.id,
          debtSeconds: 3_600,
          priorityWeight: 1.4,
        }),
      ]),
    );
  });
});
