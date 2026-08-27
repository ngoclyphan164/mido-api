import { RequestMethod } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { ZodValidationPipe } from 'nestjs-zod';

import { AppModule } from '../src/app.module';
import { SupabaseJwtVerifier } from '../src/auth/supabase-jwt-verifier.service';
import { SupabaseAdminService } from '../src/auth/supabase-admin.service';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { FairnessRepository } from '../src/fairness/fairness.repository';
import { GroupRepository } from '../src/groups/group.repository';
import { HangoutRepository } from '../src/hangouts/hangout.repository';
import { LOCATION_SEARCH_PROVIDER } from '../src/places/location-search-provider';
import { PLACE_PHOTO_PROVIDER } from '../src/places/place-photo-provider';
import { PLACES_PROVIDER } from '../src/places/places-provider';
import { ROUTING_PROVIDER } from '../src/routing/routing-provider';
import type { RouteMatrixRequest } from '../src/routing/routing-provider';
import { SuggestionRepository } from '../src/suggestions/suggestion.repository';
import { VoteRepository } from '../src/votes/vote.repository';

const e2eHangoutId = '68f9bef5-a143-45a5-bab3-4f54e3a216f6';
const e2eGroupId = 'b1d7b425-e2d2-4a31-82cf-5799985e8278';
const e2eSuggestionId = 'd89fbb8c-50fd-4d9e-9f18-a046f3709ab1';
const e2eParticipants = [
  {
    id: '9dd86c50-a225-4a1e-a4a8-2e9d06758612',
    userId: '3f8f2c43-b10d-4cd0-92d8-cc40ef58a0e8',
    name: 'Nam',
    origin: { lat: 10.7756, lng: 106.7019 },
    mode: 'two_wheeler' as const,
    weight: 1,
    fairnessDebtSeconds: 0,
  },
  {
    id: '92ce6811-74ae-44d7-9ce8-a5f8d4b8be73',
    userId: '5c5b5cc0-0247-43e4-9460-7e726c6289bc',
    name: 'Linh',
    origin: { lat: 10.7844, lng: 106.6844 },
    mode: 'drive' as const,
    weight: 1,
    fairnessDebtSeconds: 0,
  },
];
const deleteUser = vi.fn().mockResolvedValue(undefined);

describe('mido-api (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(SupabaseJwtVerifier)
      .useValue({
        verify: async () => ({
          id: '3f8f2c43-b10d-4cd0-92d8-cc40ef58a0e8',
          isAnonymous: true,
          assuranceLevel: 'aal1',
        }),
      })
      .overrideProvider(SupabaseAdminService)
      .useValue({ deleteUser })
      .overrideProvider(SuggestionRepository)
      .useValue({
        loadContext: async () => ({
          id: e2eHangoutId,
          activityType: 'cafe',
          plannedAt: new Date('2026-08-25T11:00:00Z'),
          fairnessMode: 'BALANCED',
          timeCapSeconds: 1_800,
          status: 'draft',
          participants: e2eParticipants,
        }),
        syncActiveSuggestions: async (
          _hangoutId: string,
          places: Array<{ provider: string; externalId: string }>,
        ) =>
          new Map(
            places.map((place) => [
              `${place.provider}:${place.externalId}`,
              'd89fbb8c-50fd-4d9e-9f18-a046f3709ab1',
            ]),
          ),
      })
      .overrideProvider(GroupRepository)
      .useValue({
        update: async (groupId: string, userId: string, name: string) => ({
          kind: 'ok' as const,
          group: {
            id: groupId,
            name,
            role: 'owner' as const,
            memberCount: 2,
            inviteExpiresAt: new Date('2026-09-01T00:00:00Z'),
            createdBy: userId,
            createdAt: new Date('2026-08-20T00:00:00Z'),
            members: [],
          },
        }),
        remove: async () => ({ kind: 'ok' as const }),
      })
      .overrideProvider(HangoutRepository)
      .useValue({
        update: async (
          hangoutId: string,
          userId: string,
          input: {
            activityType?: string;
            plannedAt?: Date;
            fairnessMode?: string;
            budgetMax?: number | null;
            timeCapSeconds?: number;
          },
        ) => ({
          kind: 'ok' as const,
          hangout: {
            id: hangoutId,
            groupId: e2eGroupId,
            groupName: 'Nhóm E2E',
            role: 'owner' as const,
            activityType: input.activityType ?? 'cafe',
            plannedAt: input.plannedAt ?? new Date('2026-08-25T11:00:00Z'),
            fairnessMode: input.fairnessMode ?? 'balanced',
            budgetMax: input.budgetMax ?? null,
            timeCapSeconds: input.timeCapSeconds ?? 1_800,
            status: 'draft' as const,
            createdBy: userId,
            createdAt: new Date('2026-08-20T00:00:00Z'),
            participants: [],
            pendingMembers: [],
            outing: null,
          },
        }),
        remove: async () => ({ kind: 'ok' as const }),
      })
      .overrideProvider(LOCATION_SEARCH_PROVIDER)
      .useValue({
        searchText: async () => ({
          places: [
            {
              provider: 'google_maps',
              externalId: 'e2e-landmark',
              name: 'Landmark 81',
              address: '720A Điện Biên Phủ, Bình Thạnh, Thành phố Hồ Chí Minh',
              location: { lat: 10.7949, lng: 106.7219 },
              primaryType: 'shopping_mall',
              types: ['shopping_mall'],
            },
          ],
        }),
      })
      .overrideProvider(PLACES_PROVIDER)
      .useValue({
        searchNearby: async () => ({
          snappedCenter: { lat: 10.78, lng: 106.695 },
          searchCell: '250:e2e',
          storagePolicy: { identityMayBeStored: true, contentMayBeStored: false },
          places: [
            {
              provider: 'google_maps',
              externalId: 'e2e-cafe',
              name: 'E2E Cafe',
              location: { lat: 10.78, lng: 106.695 },
              primaryType: 'cafe',
              types: ['cafe'],
              rating: 4.5,
              userRatingCount: 100,
              photos: [{ name: 'places/e2e-cafe/photos/e2e-photo' }],
            },
          ],
        }),
      })
      .overrideProvider(PLACE_PHOTO_PROVIDER)
      .useValue({
        resolvePhotoUri: async () => 'https://lh3.googleusercontent.com/e2e-cafe=s800',
      })
      .overrideProvider(ROUTING_PROVIDER)
      .useValue({
        computeRouteMatrix: async (matrix: RouteMatrixRequest) => ({
          storagePolicy: { contentMayBeStored: false },
          elements: matrix.origins.flatMap((origin, index) =>
            matrix.destinations.map((destination) => ({
              originId: origin.id,
              destinationId: destination.id,
              mode: origin.mode,
              status: 'ok' as const,
              durationSec: 600 + index * 120,
              distanceMeters: 4_000 + index * 1_000,
            })),
          ),
        }),
      })
      .overrideProvider(VoteRepository)
      .useValue({
        castVote: async (suggestionId: string, _userId: string, value: 'up' | 'down' | 'veto') => ({
          vote: {
            id: 'd2175ee8-1c08-44b0-a0f5-726563828f13',
            suggestionId,
            participantId: e2eParticipants[0]!.id,
            value,
            updatedAt: new Date('2026-08-24T13:00:00Z'),
          },
          tally: {
            up: value === 'up' ? 1 : 0,
            down: value === 'down' ? 1 : 0,
            veto: value === 'veto' ? 1 : 0,
            total: 1,
          },
        }),
      })
      .overrideProvider(FairnessRepository)
      .useValue({
        decide: async (hangoutId: string, _userId: string, suggestionId: string) => ({
          kind: 'ok' as const,
          outing: {
            id: 'f6c6e17c-4503-4c7d-aa3f-0d9865736a1f',
            hangoutId,
            chosenSuggestionId: suggestionId,
            decidedBy: e2eParticipants[0]!.userId,
            decidedAt: new Date('2026-08-24T13:00:00Z'),
            happenedAt: null,
          },
        }),
        complete: async (
          hangoutId: string,
          _userId: string,
          happenedAt: Date,
          travelTimes: Array<{ participantId: string; durationSec: number }>,
        ) => ({
          kind: 'ok' as const,
          outing: {
            id: 'f6c6e17c-4503-4c7d-aa3f-0d9865736a1f',
            hangoutId,
            chosenSuggestionId: e2eSuggestionId,
            decidedBy: e2eParticipants[0]!.userId,
            decidedAt: new Date('2026-08-24T13:00:00Z'),
            happenedAt,
          },
          meanActualDurationSec: 900,
          ledger: travelTimes.map((travelTime, index) => ({
            participantId: travelTime.participantId,
            userId: e2eParticipants[index]!.userId,
            actualDurationSec: travelTime.durationSec,
            deltaSeconds: index === 0 ? -300 : 300,
            debtSeconds: index === 0 ? -300 : 300,
          })),
        }),
        getGroupFairness: async (groupId: string) => ({
          groupId,
          members: e2eParticipants.map((participant, index) => ({
            userId: participant.userId,
            displayName: participant.name,
            debtSeconds: index === 0 ? -300 : 300,
            outingsCompleted: 1,
          })),
        }),
      })
      .compile();

    app = moduleRef.createNestApplication();
    // Phải khớp với cấu hình trong src/main.ts, nếu lệch thì test sẽ nói dối
    app.setGlobalPrefix('v1', { exclude: [{ path: 'health', method: RequestMethod.GET }] });
    app.useGlobalPipes(new ZodValidationPipe());
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
  });

  it('GET /health nằm ngoài prefix v1', async () => {
    const res = await request(app.getHttpServer()).get('/health').expect(200);

    expect(res.body).toMatchObject({ status: 'ok', service: 'mido-api' });
  });

  it('GET /v1/health không tồn tại — health cố tình bị loại khỏi prefix', async () => {
    await request(app.getHttpServer()).get('/v1/health').expect(404);
  });

  it('route cron bị chặn khi không có Authorization đúng', async () => {
    const res = await request(app.getHttpServer()).get('/v1/cron/prune-cache').expect(401);

    expect(res.body.statusCode).toBe(401);
  });

  it('route private bị chặn khi không có Supabase access token', async () => {
    const res = await request(app.getHttpServer()).get('/v1/auth/me').expect(401);

    expect(res.body.message).toBe('Thiếu Bearer access token');
  });

  it('anonymous Supabase user dùng route private như authenticated user', async () => {
    const res = await request(app.getHttpServer())
      .get('/v1/auth/me')
      .set('Authorization', 'Bearer fixture.jwt')
      .expect(200);

    expect(res.body.user).toMatchObject({
      id: '3f8f2c43-b10d-4cd0-92d8-cc40ef58a0e8',
      isAnonymous: true,
    });
  });

  it('DELETE /v1/auth/me xóa cả anonymous account và trả 204', async () => {
    await request(app.getHttpServer())
      .delete('/v1/auth/me')
      .set('Authorization', 'Bearer fixture.jwt')
      .expect(204);

    expect(deleteUser).toHaveBeenCalledWith('3f8f2c43-b10d-4cd0-92d8-cc40ef58a0e8');
  });

  it('POST /v1/midpoint/preview validate bằng Zod và không gọi API ngoài', async () => {
    const res = await request(app.getHttpServer())
      .post('/v1/midpoint/preview')
      .set('Authorization', 'Bearer fixture.jwt')
      .send({
        participants: [
          { lat: 10.7756, lng: 106.7019 },
          { lat: 10.7844, lng: 106.6844 },
          { lat: 10.7298, lng: 106.7215 },
          { lat: 10.8014, lng: 106.71 },
        ],
      })
      .expect(201);

    expect(res.body).toMatchObject({ converged: true });
    expect(res.body.searchRadiusMeters).toBeGreaterThanOrEqual(800);
  });

  it('POST /v1/midpoint/preview từ chối nhóm dưới 2 người', async () => {
    await request(app.getHttpServer())
      .post('/v1/midpoint/preview')
      .set('Authorization', 'Bearer fixture.jwt')
      .send({ participants: [{ lat: 10.7756, lng: 106.7019 }] })
      .expect(400);
  });

  it('GET /v1/places/search trả địa điểm kèm tọa độ để client đặt pin', async () => {
    const res = await request(app.getHttpServer())
      .get('/v1/places/search')
      .query({ q: 'Landmark 81', lat: 10.7769, lng: 106.7009, limit: 5 })
      .set('Authorization', 'Bearer fixture.jwt')
      .expect(200);

    expect(res.body).toMatchObject({
      attribution: 'Powered by Google',
      places: [
        {
          provider: 'google_maps',
          placeId: 'e2e-landmark',
          name: 'Landmark 81',
          location: { lat: 10.7949, lng: 106.7219 },
          // Client render tag từ đây, không phải từ `types` dạng key của Google.
          primaryTypeLabel: 'Trung tâm thương mại',
          typeLabels: ['Trung tâm thương mại'],
        },
      ],
    });
  });

  it('GET /v1/places/search validate query và bắt lat/lng đi cùng nhau', async () => {
    await request(app.getHttpServer())
      .get('/v1/places/search')
      .query({ q: 'x' })
      .set('Authorization', 'Bearer fixture.jwt')
      .expect(400);

    await request(app.getHttpServer())
      .get('/v1/places/search')
      .query({ q: 'Landmark 81', lat: 10.7769 })
      .set('Authorization', 'Bearer fixture.jwt')
      .expect(400);
  });

  it('PATCH và DELETE /v1/groups/:id sửa/xóa nhóm', async () => {
    const updated = await request(app.getHttpServer())
      .patch(`/v1/groups/${e2eGroupId}`)
      .set('Authorization', 'Bearer fixture.jwt')
      .send({ name: 'Nhóm cuối tuần' })
      .expect(200);

    expect(updated.body).toMatchObject({ id: e2eGroupId, name: 'Nhóm cuối tuần', role: 'owner' });

    await request(app.getHttpServer())
      .delete(`/v1/groups/${e2eGroupId}`)
      .set('Authorization', 'Bearer fixture.jwt')
      .expect(204);
  });

  it('PATCH và DELETE /v1/hangouts/:id sửa/xóa kèo', async () => {
    const updated = await request(app.getHttpServer())
      .patch(`/v1/hangouts/${e2eHangoutId}`)
      .set('Authorization', 'Bearer fixture.jwt')
      .send({
        activityType: 'ăn',
        plannedAt: '2026-08-26T19:00:00+07:00',
        budgetMax: null,
      })
      .expect(200);

    expect(updated.body).toMatchObject({
      id: e2eHangoutId,
      activityType: 'ăn',
      budgetMax: null,
    });
    expect(updated.body.plannedAt).toBe('2026-08-26T12:00:00.000Z');

    await request(app.getHttpServer())
      .delete(`/v1/hangouts/${e2eHangoutId}`)
      .set('Authorization', 'Bearer fixture.jwt')
      .expect(204);
  });

  it('PATCH update từ chối body rỗng bằng Zod', async () => {
    await request(app.getHttpServer())
      .patch(`/v1/hangouts/${e2eHangoutId}`)
      .set('Authorization', 'Bearer fixture.jwt')
      .send({})
      .expect(400);

    await request(app.getHttpServer())
      .patch(`/v1/groups/${e2eGroupId}`)
      .set('Authorization', 'Bearer fixture.jwt')
      .send({})
      .expect(400);
  });

  it('POST /v1/hangouts/:id/suggest trả đủ travelTimes cho mỗi candidate', async () => {
    const res = await request(app.getHttpServer())
      .post(`/v1/hangouts/${e2eHangoutId}/suggest`)
      .set('Authorization', 'Bearer fixture.jwt')
      .send({ topN: 1, minimumRating: 4 })
      .expect(200);

    expect(res.body).toMatchObject({ status: 'ok', hangoutId: e2eHangoutId });
    expect(res.body.suggestions).toHaveLength(1);
    expect(res.body.suggestions[0].suggestionId).toBe('d89fbb8c-50fd-4d9e-9f18-a046f3709ab1');
    expect(res.body.suggestions[0].typeLabels).toEqual(['Quán cà phê']);
    expect(res.body.suggestions[0].images).toEqual([
      'https://lh3.googleusercontent.com/e2e-cafe=s800',
    ]);
    expect(res.body.suggestions[0].travelTimes).toHaveLength(2);
    expect(res.body.suggestions[0].travelTimes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'Nam', mode: 'two_wheeler' }),
        expect.objectContaining({ name: 'Linh', mode: 'drive' }),
      ]),
    );
    expect(res.body.meta.fairness.participants).toHaveLength(2);
  });

  it('POST /v1/hangouts/:id/suggest validate UUID bằng Zod', async () => {
    await request(app.getHttpServer())
      .post('/v1/hangouts/not-a-uuid/suggest')
      .set('Authorization', 'Bearer fixture.jwt')
      .send({})
      .expect(400);
  });

  it('POST /v1/hangouts/:id/suggest nhận topN tới 20 để client xin nguyên pool', async () => {
    await request(app.getHttpServer())
      .post(`/v1/hangouts/${e2eHangoutId}/suggest`)
      .set('Authorization', 'Bearer fixture.jwt')
      .send({ topN: 20 })
      .expect(200);

    await request(app.getHttpServer())
      .post(`/v1/hangouts/${e2eHangoutId}/suggest`)
      .set('Authorization', 'Bearer fixture.jwt')
      .send({ topN: 21 })
      .expect(400);
  });

  it('POST /v1/suggestions/:id/votes upsert vote và trả tally', async () => {
    const suggestionId = 'd89fbb8c-50fd-4d9e-9f18-a046f3709ab1';
    const res = await request(app.getHttpServer())
      .post(`/v1/suggestions/${suggestionId}/votes`)
      .set('Authorization', 'Bearer fixture.jwt')
      .send({ value: 'veto' })
      .expect(200);

    expect(res.body).toMatchObject({
      vote: { suggestionId, value: 'veto' },
      tally: { up: 0, down: 0, veto: 1, total: 1 },
    });
  });

  it('POST /v1/suggestions/:id/votes validate vote value bằng Zod', async () => {
    await request(app.getHttpServer())
      .post('/v1/suggestions/d89fbb8c-50fd-4d9e-9f18-a046f3709ab1/votes')
      .set('Authorization', 'Bearer fixture.jwt')
      .send({ value: 'maybe' })
      .expect(400);
  });

  it('POST /v1/hangouts/:id/decide chốt active suggestion', async () => {
    const res = await request(app.getHttpServer())
      .post(`/v1/hangouts/${e2eHangoutId}/decide`)
      .set('Authorization', 'Bearer fixture.jwt')
      .send({ suggestionId: e2eSuggestionId })
      .expect(200);

    expect(res.body).toMatchObject({
      outing: { hangoutId: e2eHangoutId, chosenSuggestionId: e2eSuggestionId },
    });
  });

  it('POST /v1/hangouts/:id/complete ghi actual time vào fairness ledger', async () => {
    const res = await request(app.getHttpServer())
      .post(`/v1/hangouts/${e2eHangoutId}/complete`)
      .set('Authorization', 'Bearer fixture.jwt')
      .send({
        happenedAt: '2026-08-23T12:00:00Z',
        actualTravelTimes: [
          { participantId: e2eParticipants[0]!.id, durationSec: 600 },
          { participantId: e2eParticipants[1]!.id, durationSec: 1_200 },
        ],
      })
      .expect(200);

    expect(res.body).toMatchObject({ meanActualDurationSec: 900 });
    expect(res.body.ledger).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ participantId: e2eParticipants[0]!.id, deltaSeconds: -300 }),
        expect.objectContaining({ participantId: e2eParticipants[1]!.id, deltaSeconds: 300 }),
      ]),
    );
  });

  it('GET /v1/groups/:id/fairness trả debt hiện tại của cả nhóm', async () => {
    const res = await request(app.getHttpServer())
      .get(`/v1/groups/${e2eGroupId}/fairness`)
      .set('Authorization', 'Bearer fixture.jwt')
      .expect(200);

    expect(res.body).toMatchObject({ groupId: e2eGroupId });
    expect(res.body.members).toHaveLength(2);
  });

  it('lỗi trả về theo đúng shape của AllExceptionsFilter', async () => {
    const res = await request(app.getHttpServer()).get('/khong-ton-tai').expect(404);

    expect(res.body).toMatchObject({ statusCode: 404, path: '/khong-ton-tai' });
    expect(typeof res.body.timestamp).toBe('string');
  });
});
