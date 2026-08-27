import { Logger, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import type { PlaceDetailsProvider } from '../places/place-details-provider';
import type { PlacePhotoProvider } from '../places/place-photo-provider';
import type {
  SuggestionSnapshotRepository,
  SuggestionSnapshotRow,
} from './suggestion-snapshot.repository';
import { SuggestionSnapshotService } from './suggestion-snapshot.service';

const row: SuggestionSnapshotRow = {
  id: 'snapshot-id',
  suggestionId: 'suggestion-id',
  hangoutId: 'hangout-id',
  rank: 1,
  isActive: true,
  provider: 'google_maps',
  externalPlaceId: 'ChIJ-fixture-cafe',
  name: 'Cà phê Fixture',
  formattedAddress: '12 Nguyễn Huệ, Quận 1',
  lat: 10.7761,
  lng: 106.7009,
  primaryType: 'cafe',
  types: ['cafe', 'coffee_shop', 'food'],
  rating: '4.60',
  userRatingCount: 321,
  priceLevel: 2,
  mapsUri: 'https://maps.google.com/?cid=fixture-cafe',
  photoNames: ['places/ChIJ-fixture-cafe/photos/AeeoHcK-fixture'],
  photoUri: null,
  photoUriFetchedAt: null,
  availability: 'open',
  score: '0.8125',
  scoreBreakdown: { fairness: 0.9 },
  travelTimes: [{ participantId: 'p1', name: 'Linh', durationSec: 720, mode: 'two_wheeler' }],
  fetchedAt: new Date('2026-08-26T12:00:00Z'),
};

function serviceWith(
  repository: Partial<SuggestionSnapshotRepository>,
  details: Partial<PlaceDetailsProvider> = {},
  photos: Partial<PlacePhotoProvider> = {},
) {
  return new SuggestionSnapshotService(
    repository as SuggestionSnapshotRepository,
    details as PlaceDetailsProvider,
    photos as PlacePhotoProvider,
  );
}

describe('SuggestionSnapshotService', () => {
  it('trả lại gợi ý đã lưu kèm travel time và tally, không gọi provider nào', async () => {
    const searchNearby = vi.fn();
    const service = serviceWith(
      {
        listActiveForHangout: vi.fn().mockResolvedValue([row]),
        countActiveForHangout: vi.fn().mockResolvedValue(20),
        tallies: vi
          .fn()
          .mockResolvedValue(new Map([['suggestion-id', { up: 2, down: 0, veto: 0, total: 2 }]])),
        savePhotoUri: vi.fn(),
      },
      {},
      { resolvePhotoUri: vi.fn().mockResolvedValue('https://lh3.googleusercontent.com/fixture') },
    );

    await expect(service.listForHangout('hangout-id')).resolves.toMatchObject({
      total: 20,
      offset: 0,
      suggestions: [
        {
          suggestionId: 'suggestion-id',
          name: 'Cà phê Fixture',
          typeLabels: ['Quán cà phê'],
          rating: 4.6,
          score: 0.8125,
          travelTimes: [expect.objectContaining({ name: 'Linh', durationSec: 720 })],
          tally: { up: 2, down: 0, veto: 0, total: 2 },
        },
      ],
    });
    expect(searchNearby).not.toHaveBeenCalled();
  });

  it('dùng lại URL ảnh còn hạn thay vì gọi Place Photo mỗi lần đọc', async () => {
    const resolvePhotoUri = vi.fn();
    const service = serviceWith(
      {
        listActiveForHangout: vi.fn().mockResolvedValue([
          {
            ...row,
            photoUri: 'https://lh3.googleusercontent.com/cached',
            photoUriFetchedAt: new Date(),
          },
        ]),
        countActiveForHangout: vi.fn().mockResolvedValue(1),
        tallies: vi.fn().mockResolvedValue(new Map()),
        savePhotoUri: vi.fn(),
      },
      {},
      { resolvePhotoUri },
    );

    const page = await service.listForHangout('hangout-id');
    expect(page.suggestions[0]!.images).toEqual(['https://lh3.googleusercontent.com/cached']);
    expect(resolvePhotoUri).not.toHaveBeenCalled();
  });

  it('trả rỗng thay vì ném lỗi khi đọc hỏng, để client còn gọi /suggest', async () => {
    vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const service = serviceWith({
      listActiveForHangout: vi.fn().mockRejectedValue(new Error('relation does not exist')),
    });

    await expect(service.listForHangout('hangout-id')).resolves.toEqual({
      suggestions: [],
      total: 0,
      offset: 0,
    });
  });

  it('giấu kèo của nhóm khác bằng 404', async () => {
    const service = serviceWith({ isHangoutMember: vi.fn().mockResolvedValue(false) });

    await expect(service.listForMember('hangout-id', 'user-id')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('lấp snapshot cho kèo chốt trước khi bảng này tồn tại', async () => {
    const saveMany = vi.fn();
    const service = serviceWith(
      {
        findChosenForHangout: vi.fn().mockResolvedValueOnce(undefined).mockResolvedValueOnce(row),
        saveMany,
        savePhotoUri: vi.fn(),
        findChosenPlaceRef: vi.fn().mockResolvedValue({
          suggestionId: 'suggestion-id',
          provider: 'google_maps',
          externalPlaceId: 'ChIJ-fixture-cafe',
        }),
      },
      {
        getDetails: vi.fn().mockResolvedValue({
          provider: 'google_maps',
          externalId: 'ChIJ-fixture-cafe',
          name: 'Cà phê Fixture',
          location: { lat: 10.7761, lng: 106.7009 },
          types: ['cafe'],
          photos: [{ name: 'places/ChIJ-fixture-cafe/photos/AeeoHcK-fixture' }],
        }),
      },
      { resolvePhotoUri: vi.fn().mockResolvedValue(undefined) },
    );

    await expect(service.getChosenForHangout('hangout-id')).resolves.toMatchObject({
      name: 'Cà phê Fixture',
    });
    // Số phút của lần suggest đó đã mất, không bịa ra được.
    expect(saveMany).toHaveBeenCalledWith([expect.objectContaining({ travelTimes: [] })]);
  });

  it('không chặn việc chốt kèo khi Google không trả nội dung', async () => {
    vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const saveMany = vi.fn();
    const service = serviceWith(
      {
        findChosenForHangout: vi.fn().mockResolvedValue(undefined),
        saveMany,
        findChosenPlaceRef: vi.fn().mockResolvedValue({
          suggestionId: 'suggestion-id',
          provider: 'google_maps',
          externalPlaceId: 'ChIJ-fixture-cafe',
        }),
      },
      { getDetails: vi.fn().mockResolvedValue(undefined) },
    );

    await expect(service.getChosenForHangout('hangout-id')).resolves.toBeUndefined();
    expect(saveMany).not.toHaveBeenCalled();
  });
});
