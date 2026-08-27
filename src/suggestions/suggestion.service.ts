import {
  BadGatewayException,
  ConflictException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ZodError } from 'zod';

import {
  ProviderCircuitOpenError,
  ProviderQuotaExceededError,
} from '../common/providers/provider-resilience';
import { FAIRNESS_DEBT_SCALE_SECONDS, fairnessPriorityWeight } from '../fairness/fairness';
import { haversineMeters } from '../midpoint/geometry';
import { computeMidpointPreview } from '../midpoint/preview';
import { rankCandidates } from '../midpoint/scoring';
import type { PlacePhotoProvider } from '../places/place-photo-provider';
import { PLACE_PHOTO_PROVIDER } from '../places/place-photo-provider';
import { placeTypeLabels } from '../places/place-types';
import type { PlaceCandidate, PlacesProvider } from '../places/places-provider';
import { PLACES_PROVIDER } from '../places/places-provider';
import { GoogleMapsConfigurationError, GoogleMapsHttpError } from '../providers/google-maps.client';
import type { RouteMatrixElement, RoutingProvider } from '../routing/routing-provider';
import { ROUTING_PROVIDER } from '../routing/routing-provider';
import { placeTypesForActivity } from './activity';
import type { EvaluatedPlace } from './place-evaluation';
import { evaluatePlaces } from './place-evaluation';
import type { HangoutSuggestionContext, SuggestionParticipant } from './suggestion.repository';
import { SuggestionRepository } from './suggestion.repository';
import { SuggestionSnapshotRepository } from './suggestion-snapshot.repository';

type TravelTimeView = {
  participantId: string;
  name: string;
  durationSec: number;
  distanceMeters?: number;
  mode: SuggestionParticipant['mode'];
};

type SuggestionView = {
  suggestionId: string;
  id: string;
  provider: string;
  name: string;
  location: PlaceCandidate['location'];
  primaryType?: string;
  types: string[];
  /** `types` đã dịch sang tiếng Việt để client render tag, `primaryType` đứng đầu. */
  primaryTypeLabel?: string;
  typeLabels: string[];
  rating?: number;
  userRatingCount?: number;
  priceLevel?: number;
  images: string[];
  mapsUri?: string;
  /** @deprecated Dùng mapsUri. */
  googleMapsUri?: string;
  availability: EvaluatedPlace['availability'];
  score: number;
  scoreBreakdown: ReturnType<typeof rankCandidates>['candidates'][number]['breakdown'];
  travelTimes: TravelTimeView[];
};

export type SuggestionResponse = {
  status: 'ok' | 'no_candidates' | 'split_recommended';
  hangoutId: string;
  seed: PlaceCandidate['location'];
  searchRadiusMeters: number;
  suggestions: SuggestionView[];
  splitSuggestion?: {
    clusters: Array<{
      seed: PlaceCandidate['location'];
      participants: Array<{ id: string; name: string }>;
    }>;
  };
  meta: {
    capRelaxed: boolean;
    placesReceived: number;
    placesAfterFilters: number;
    placesRouted: number;
    searchCell?: string;
    fairness: {
      debtScaleSeconds: number;
      participants: Array<{
        participantId: string;
        name: string;
        debtSeconds: number;
        priorityWeight: number;
        effectiveWeight: number;
      }>;
    };
  };
};

type SuggestOptions = { topN: number; minimumRating?: number };

@Injectable()
export class SuggestionService {
  private readonly logger = new Logger(SuggestionService.name);

  constructor(
    private readonly repository: SuggestionRepository,
    @Inject(PLACES_PROVIDER) private readonly placesProvider: PlacesProvider,
    @Inject(ROUTING_PROVIDER) private readonly routingProvider: RoutingProvider,
    @Inject(PLACE_PHOTO_PROVIDER) private readonly photoProvider: PlacePhotoProvider,
    private readonly snapshots: SuggestionSnapshotRepository,
  ) {}

  async suggest(
    hangoutId: string,
    userId: string,
    options: SuggestOptions,
  ): Promise<SuggestionResponse> {
    const context = await this.repository.loadContext(hangoutId, userId);
    if (!context) throw new NotFoundException('Không tìm thấy kèo hoặc bạn không thuộc nhóm này');
    this.assertSuggestable(context);

    const participantWeights = context.participants.map((participant) =>
      this.effectiveParticipantWeight(participant, context.fairnessMode),
    );

    const midpoint = computeMidpointPreview(
      context.participants.map((participant, index) => ({
        ...participant.origin,
        weight: participantWeights[index],
      })),
    );
    if (midpoint.splitSuggestion) return this.toSplitResponse(context, midpoint);

    const includedTypes = placeTypesForActivity(context.activityType);
    if (!includedTypes) {
      throw new UnprocessableEntityException(
        `Activity type chưa được hỗ trợ: ${context.activityType}`,
      );
    }

    try {
      const nearby = await this.placesProvider.searchNearby({
        center: midpoint.seed,
        radiusMeters: midpoint.searchRadiusMeters,
        includedTypes: [...includedTypes],
        maxResults: 20,
        rankPreference: 'popularity',
      });
      const evaluated = this.shortlist(
        evaluatePlaces(nearby.places, context.plannedAt, context.budgetMax, options.minimumRating),
        midpoint.seed,
      );
      if (evaluated.length === 0) {
        await this.repository.syncActiveSuggestions(context.id, []);
        return this.emptyResponse(context, midpoint.seed, midpoint.searchRadiusMeters, {
          placesReceived: nearby.places.length,
          placesAfterFilters: 0,
          searchCell: nearby.searchCell,
        });
      }

      const routeMatrix = await this.routingProvider.computeRouteMatrix({
        origins: context.participants.map((participant) => ({
          id: participant.id,
          location: participant.origin,
          mode: participant.mode,
        })),
        destinations: evaluated.map(({ key, place }) => ({ id: key, location: place.location })),
        departureTime: context.plannedAt,
      });
      const routed = this.joinTravelTimes(evaluated, context.participants, routeMatrix.elements);
      const ranked = rankCandidates(
        routed.map(({ key, evaluatedPlace, travelTimes }) => ({
          id: key,
          travelTimesSeconds: travelTimes.map((travel) => travel.durationSec),
          participantWeights,
          rating: evaluatedPlace.place.rating,
          userRatingCount: evaluatedPlace.place.userRatingCount,
          preference: this.preferenceScore(evaluatedPlace, includedTypes),
          context: evaluatedPlace.availability === 'open' ? 1 : 0.5,
        })),
        context.fairnessMode,
        context.timeCapSeconds,
      );
      const routedByKey = new Map(routed.map((candidate) => [candidate.key, candidate]));
      const selected = ranked.candidates.slice(0, options.topN).flatMap((scored) => {
        const candidate = routedByKey.get(scored.id);
        return candidate ? [{ scored, candidate }] : [];
      });
      const suggestionIds = await this.repository.syncActiveSuggestions(
        context.id,
        selected.map(({ candidate }) => candidate.evaluatedPlace.place),
      );
      // Ảnh chỉ resolve cho đúng những option trả về client — mỗi place là một
      // call Place Photo, không đốt quota cho candidate đã bị loại.
      const images = await Promise.all(
        selected.map(({ candidate }) => this.resolveImages(candidate.evaluatedPlace.place)),
      );
      const suggestions = selected.map(({ scored, candidate }, index) => {
        const suggestionId = suggestionIds.get(scored.id);
        if (!suggestionId) {
          throw new Error(`Không persist được suggestion option cho ${scored.id}`);
        }
        return this.toSuggestion(
          candidate.evaluatedPlace,
          candidate.travelTimes,
          scored,
          suggestionId,
          images[index] ?? [],
        );
      });

      // Lưu lại nội dung provider để lần sau đọc từ DB thay vì trả tiền gọi
      // lại pipeline này. Best-effort: response vẫn trả bình thường nếu ghi hỏng.
      await this.persistSnapshots(selected, suggestions);

      return {
        status: suggestions.length > 0 ? 'ok' : 'no_candidates',
        hangoutId: context.id,
        seed: midpoint.seed,
        searchRadiusMeters: midpoint.searchRadiusMeters,
        suggestions,
        meta: {
          capRelaxed: ranked.capRelaxed,
          placesReceived: nearby.places.length,
          placesAfterFilters: evaluated.length,
          placesRouted: routed.length,
          searchCell: nearby.searchCell,
          fairness: this.fairnessMeta(context),
        },
      };
    } catch (error) {
      this.rethrowProviderError(error);
    }
  }

  private assertSuggestable(context: HangoutSuggestionContext): void {
    if (
      context.status === 'decided' ||
      context.status === 'done' ||
      context.status === 'cancelled'
    ) {
      throw new ConflictException(`Không thể suggest khi kèo đang ở trạng thái ${context.status}`);
    }
    if (context.participants.length < 2 || context.participants.length > 10) {
      throw new UnprocessableEntityException('Kèo cần từ 2 đến 10 người tham gia');
    }
  }

  private shortlist(evaluated: EvaluatedPlace[], seed: PlaceCandidate['location']) {
    const unique = new Map<string, EvaluatedPlace>();
    for (const candidate of evaluated) {
      unique.set(`${candidate.place.provider}:${candidate.place.externalId}`, candidate);
    }

    return [...unique.entries()]
      .map(([key, candidate]) => ({ key, ...candidate }))
      .sort(
        (left, right) =>
          haversineMeters(left.place.location, seed) - haversineMeters(right.place.location, seed),
      )
      .slice(0, 20);
  }

  private joinTravelTimes(
    candidates: Array<{ key: string } & EvaluatedPlace>,
    participants: SuggestionParticipant[],
    elements: RouteMatrixElement[],
  ) {
    const elementsByPair = new Map(
      elements.map((element) => [`${element.originId}:${element.destinationId}`, element]),
    );

    return candidates.flatMap((evaluatedPlace) => {
      const travelTimes: TravelTimeView[] = [];
      for (const participant of participants) {
        const route = elementsByPair.get(`${participant.id}:${evaluatedPlace.key}`);
        if (!route || route.status !== 'ok' || route.durationSec === undefined) return [];
        travelTimes.push({
          participantId: participant.id,
          name: participant.name,
          durationSec: route.durationSec,
          distanceMeters: route.distanceMeters,
          mode: participant.mode,
        });
      }
      return [{ key: evaluatedPlace.key, evaluatedPlace, travelTimes }];
    });
  }

  private preferenceScore(candidate: EvaluatedPlace, includedTypes: readonly string[]): number {
    const typeScore = candidate.place.primaryType
      ? includedTypes.includes(candidate.place.primaryType)
        ? 1
        : 0.7
      : candidate.place.types.some((type) => includedTypes.includes(type))
        ? 0.9
        : 0.5;
    const budgetScore = candidate.budgetMatch === 'match' ? 1 : 0.6;
    return (typeScore + budgetScore) / 2;
  }

  /**
   * Ảnh lưu resource name chứ không lưu URL trong `images`: URL đã ký của Google
   * hết hạn sau ít phút, còn resource name thì resolve lại được mãi.
   */
  private async persistSnapshots(
    selected: { candidate: { evaluatedPlace: EvaluatedPlace } }[],
    suggestions: SuggestionView[],
  ): Promise<void> {
    try {
      await this.snapshots.saveMany(
        suggestions.map((suggestion, index) => {
          const place = selected[index]!.candidate.evaluatedPlace.place;
          return {
            suggestionId: suggestion.suggestionId,
            provider: suggestion.provider,
            externalPlaceId: suggestion.id,
            name: suggestion.name,
            address: place.address,
            location: suggestion.location,
            primaryType: suggestion.primaryType,
            types: suggestion.types,
            rating: suggestion.rating,
            userRatingCount: suggestion.userRatingCount,
            priceLevel: suggestion.priceLevel,
            mapsUri: suggestion.mapsUri,
            photoNames: (place.photos ?? []).map((photo) => photo.name),
            // URL này vừa được resolve và tính tiền ở trên; lưu lại để lần đọc
            // đầu tiên khỏi gọi Place Photo thêm một lượt nữa.
            photoUri: suggestion.images[0],
            availability: suggestion.availability,
            score: suggestion.score,
            scoreBreakdown: suggestion.scoreBreakdown,
            travelTimes: suggestion.travelTimes,
          };
        }),
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Không lưu được snapshot gợi ý: ${message}`);
    }
  }

  private async resolveImages(place: PlaceCandidate): Promise<string[]> {
    const photo = place.photos?.[0];
    if (!photo) return [];

    const uri = await this.photoProvider.resolvePhotoUri(photo);
    return uri ? [uri] : [];
  }

  private toSuggestion(
    candidate: EvaluatedPlace,
    travelTimes: TravelTimeView[],
    scored: ReturnType<typeof rankCandidates>['candidates'][number],
    suggestionId: string,
    images: string[],
  ): SuggestionView {
    const place = candidate.place;
    const typeLabels = placeTypeLabels(place.types, place.primaryType);
    return {
      suggestionId,
      id: place.externalId,
      provider: place.provider,
      name: place.name,
      location: place.location,
      primaryType: place.primaryType,
      types: place.types,
      primaryTypeLabel: typeLabels[0],
      typeLabels,
      rating: place.rating,
      userRatingCount: place.userRatingCount,
      priceLevel: place.priceLevel,
      images,
      mapsUri: place.mapsUri ?? place.googleMapsUri,
      googleMapsUri: place.googleMapsUri,
      availability: candidate.availability,
      score: scored.score,
      scoreBreakdown: scored.breakdown,
      travelTimes,
    };
  }

  private toSplitResponse(
    context: HangoutSuggestionContext,
    midpoint: ReturnType<typeof computeMidpointPreview>,
  ): SuggestionResponse {
    const split = midpoint.splitSuggestion!;
    return {
      status: 'split_recommended',
      hangoutId: context.id,
      seed: midpoint.seed,
      searchRadiusMeters: midpoint.searchRadiusMeters,
      suggestions: [],
      splitSuggestion: {
        clusters: split.clusters.map((indices, clusterIndex) => ({
          seed: split.seeds[clusterIndex]!,
          participants: indices.map((index) => ({
            id: context.participants[index]!.id,
            name: context.participants[index]!.name,
          })),
        })),
      },
      meta: {
        capRelaxed: false,
        placesReceived: 0,
        placesAfterFilters: 0,
        placesRouted: 0,
        fairness: this.fairnessMeta(context),
      },
    };
  }

  private emptyResponse(
    context: HangoutSuggestionContext,
    seed: PlaceCandidate['location'],
    searchRadiusMeters: number,
    counts: { placesReceived: number; placesAfterFilters: number; searchCell?: string },
  ): SuggestionResponse {
    return {
      status: 'no_candidates',
      hangoutId: context.id,
      seed,
      searchRadiusMeters,
      suggestions: [],
      meta: {
        capRelaxed: false,
        placesRouted: 0,
        ...counts,
        fairness: this.fairnessMeta(context),
      },
    };
  }

  private effectiveParticipantWeight(
    participant: SuggestionParticipant,
    fairnessMode: HangoutSuggestionContext['fairnessMode'],
  ): number {
    const configuredWeight = fairnessMode === 'WEIGHTED' ? participant.weight : 1;
    return configuredWeight * fairnessPriorityWeight(participant.fairnessDebtSeconds);
  }

  private fairnessMeta(context: HangoutSuggestionContext): SuggestionResponse['meta']['fairness'] {
    return {
      debtScaleSeconds: FAIRNESS_DEBT_SCALE_SECONDS,
      participants: context.participants.map((participant) => ({
        participantId: participant.id,
        name: participant.name,
        debtSeconds: participant.fairnessDebtSeconds,
        priorityWeight: fairnessPriorityWeight(participant.fairnessDebtSeconds),
        effectiveWeight: this.effectiveParticipantWeight(participant, context.fairnessMode),
      })),
    };
  }

  private rethrowProviderError(error: unknown): never {
    if (error instanceof ProviderQuotaExceededError) {
      throw new HttpException(error.message, HttpStatus.TOO_MANY_REQUESTS);
    }
    if (
      error instanceof ProviderCircuitOpenError ||
      error instanceof GoogleMapsConfigurationError
    ) {
      throw new ServiceUnavailableException(error.message);
    }
    if (error instanceof GoogleMapsHttpError) {
      // Payload của Google có thể chứa chi tiết key/project — chỉ log, không trả client.
      this.logger.error(`Google Maps HTTP ${error.status}: ${error.message}`);
      if (error.status === 401 || error.status === 403) {
        throw new ServiceUnavailableException('Provider bản đồ chưa được cấp quyền cho API này');
      }
      if (error.status === 429) {
        throw new HttpException('Provider bản đồ đang bị giới hạn', HttpStatus.TOO_MANY_REQUESTS);
      }
      throw new BadGatewayException('Provider bản đồ trả về lỗi');
    }
    if (error instanceof ZodError) {
      this.logger.error(`Google Maps payload không hợp lệ: ${error.message}`);
      throw new BadGatewayException('Provider bản đồ trả về lỗi');
    }
    throw error;
  }
}
