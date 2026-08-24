import {
  BadGatewayException,
  ConflictException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
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
  rating?: number;
  userRatingCount?: number;
  priceLevel?: number;
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
  constructor(
    private readonly repository: SuggestionRepository,
    @Inject(PLACES_PROVIDER) private readonly placesProvider: PlacesProvider,
    @Inject(ROUTING_PROVIDER) private readonly routingProvider: RoutingProvider,
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
      const selected = ranked.candidates.slice(0, options.topN);
      const selectedPlaces = selected.flatMap((scored) => {
        const candidate = routedByKey.get(scored.id);
        return candidate ? [candidate.evaluatedPlace.place] : [];
      });
      const suggestionIds = await this.repository.syncActiveSuggestions(context.id, selectedPlaces);
      const suggestions = selected.flatMap((scored) => {
        const candidate = routedByKey.get(scored.id);
        const suggestionId = suggestionIds.get(scored.id);
        if (!candidate) return [];
        if (!suggestionId) {
          throw new Error(`Không persist được suggestion option cho ${scored.id}`);
        }
        return [
          this.toSuggestion(candidate.evaluatedPlace, candidate.travelTimes, scored, suggestionId),
        ];
      });

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

  private toSuggestion(
    candidate: EvaluatedPlace,
    travelTimes: TravelTimeView[],
    scored: ReturnType<typeof rankCandidates>['candidates'][number],
    suggestionId: string,
  ): SuggestionView {
    const place = candidate.place;
    return {
      suggestionId,
      id: place.externalId,
      provider: place.provider,
      name: place.name,
      location: place.location,
      primaryType: place.primaryType,
      types: place.types,
      rating: place.rating,
      userRatingCount: place.userRatingCount,
      priceLevel: place.priceLevel,
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
    if (error instanceof GoogleMapsHttpError || error instanceof ZodError) {
      throw new BadGatewayException('Provider bản đồ trả về lỗi');
    }
    throw error;
  }
}
