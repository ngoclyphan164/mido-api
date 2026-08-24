import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { z } from 'zod';

import {
  DailyProviderQuota,
  ProviderCircuitBreaker,
} from '../common/providers/provider-resilience';
import { GoogleMapsClient, GoogleMapsHttpError } from '../providers/google-maps.client';
import type {
  RouteDestination,
  RouteMatrixElement,
  RouteMatrixRequest,
  RouteMatrixResult,
  RouteOrigin,
  RoutingProvider,
  TravelMode,
} from './routing-provider';

const GOOGLE_ROUTES_URL = 'https://routes.googleapis.com/distanceMatrix/v2:computeRouteMatrix';
const GOOGLE_ROUTES_FIELD_MASK =
  'originIndex,destinationIndex,status,condition,distanceMeters,duration';

const matrixElementSchema = z.object({
  originIndex: z.number().int().nonnegative(),
  destinationIndex: z.number().int().nonnegative(),
  status: z
    .object({ code: z.number().int().default(0), message: z.string().optional() })
    .optional(),
  condition: z.string().optional(),
  distanceMeters: z.number().int().nonnegative().optional(),
  duration: z
    .string()
    .regex(/^\d+(?:\.\d+)?s$/)
    .optional(),
});
const matrixResponseSchema = z.array(matrixElementSchema);

const googleTravelModes: Record<TravelMode, string> = {
  two_wheeler: 'TWO_WHEELER',
  drive: 'DRIVE',
  walk: 'WALK',
  transit: 'TRANSIT',
};

type IndexedOrigin = { origin: RouteOrigin; globalIndex: number };
type IndexedDestination = { destination: RouteDestination; globalIndex: number };

@Injectable()
export class GoogleRoutesProvider implements RoutingProvider {
  private readonly quota: DailyProviderQuota;
  private readonly circuit: ProviderCircuitBreaker;

  constructor(
    private readonly client: GoogleMapsClient,
    config: ConfigService,
  ) {
    this.quota = new DailyProviderQuota(
      'google-routes-elements',
      config.get<number>('GOOGLE_ROUTES_DAILY_ELEMENT_LIMIT') ?? 10_000,
    );
    this.circuit = new ProviderCircuitBreaker(
      config.get<number>('GOOGLE_CIRCUIT_FAILURE_THRESHOLD') ?? 3,
      config.get<number>('GOOGLE_CIRCUIT_RESET_MS') ?? 30_000,
    );
  }

  async computeRouteMatrix(request: RouteMatrixRequest): Promise<RouteMatrixResult> {
    this.validateRequest(request);
    const indexedDestinations = request.destinations.map((destination, globalIndex) => ({
      destination,
      globalIndex,
    }));
    const elements: RouteMatrixElement[] = [];

    for (const mode of Object.keys(googleTravelModes) as TravelMode[]) {
      const origins = request.origins
        .map((origin, globalIndex) => ({ origin, globalIndex }))
        .filter((item) => item.origin.mode === mode);
      if (origins.length === 0) continue;

      const elementLimit = mode === 'transit' ? 100 : 625;
      if (origins.length > elementLimit) {
        throw new RangeError(`${mode} origins exceed Google matrix element limit`);
      }
      const destinationsPerRequest = Math.max(1, Math.floor(elementLimit / origins.length));

      for (let offset = 0; offset < indexedDestinations.length; offset += destinationsPerRequest) {
        const destinations = indexedDestinations.slice(offset, offset + destinationsPerRequest);
        elements.push(
          ...(await this.computeBatch(origins, destinations, mode, request.departureTime)),
        );
      }
    }

    return {
      elements,
      // Routes content của Google không được ghi vào route_matrix_cache.
      storagePolicy: { contentMayBeStored: false },
    };
  }

  private async computeBatch(
    origins: IndexedOrigin[],
    destinations: IndexedDestination[],
    mode: TravelMode,
    departureTime: Date,
  ): Promise<RouteMatrixElement[]> {
    const body: Record<string, unknown> = {
      origins: origins.map(({ origin }) => this.toRouteMatrixLocation(origin.location)),
      destinations: destinations.map(({ destination }) =>
        this.toRouteMatrixLocation(destination.location),
      ),
      travelMode: googleTravelModes[mode],
      departureTime: departureTime.toISOString(),
      languageCode: 'vi',
      units: 'METRIC',
    };
    if (mode === 'drive' || mode === 'two_wheeler') {
      body.routingPreference = 'TRAFFIC_AWARE';
    }

    const payload = await this.circuit.execute(
      () => {
        this.quota.consume(origins.length * destinations.length);
        return this.client.postJson(GOOGLE_ROUTES_URL, GOOGLE_ROUTES_FIELD_MASK, body);
      },
      (error) => error instanceof GoogleMapsHttpError && error.retryable,
    );
    const response = matrixResponseSchema.parse(payload);
    const byPair = new Map(
      response.map((element) => [`${element.originIndex}:${element.destinationIndex}`, element]),
    );

    return origins.flatMap(({ origin }, originIndex) =>
      destinations.map(({ destination }, destinationIndex) => {
        const element = byPair.get(`${originIndex}:${destinationIndex}`);
        const common = {
          originId: origin.id,
          destinationId: destination.id,
          mode,
        };
        if (!element) {
          return {
            ...common,
            status: 'error' as const,
            errorMessage: 'Google Routes omitted this matrix element',
          };
        }
        if (element.status && element.status.code !== 0) {
          return {
            ...common,
            status: 'error' as const,
            errorCode: element.status.code,
            errorMessage: element.status.message,
          };
        }
        if (element.condition !== 'ROUTE_EXISTS' || !element.duration) {
          return { ...common, status: 'unreachable' as const };
        }
        return {
          ...common,
          status: 'ok' as const,
          durationSec: Math.round(Number.parseFloat(element.duration.slice(0, -1))),
          distanceMeters: element.distanceMeters,
        };
      }),
    );
  }

  private toRouteMatrixLocation(location: { lat: number; lng: number }) {
    return {
      waypoint: {
        location: { latLng: { latitude: location.lat, longitude: location.lng } },
      },
    };
  }

  private validateRequest(request: RouteMatrixRequest): void {
    if (request.origins.length === 0 || request.destinations.length === 0) {
      throw new RangeError('route matrix requires at least one origin and destination');
    }
    if (Number.isNaN(request.departureTime.getTime())) {
      throw new RangeError('departureTime must be valid');
    }
    if (new Set(request.origins.map((origin) => origin.id)).size !== request.origins.length) {
      throw new RangeError('origin ids must be unique');
    }
    if (
      new Set(request.destinations.map((destination) => destination.id)).size !==
      request.destinations.length
    ) {
      throw new RangeError('destination ids must be unique');
    }
    for (const location of [
      ...request.origins.map((origin) => origin.location),
      ...request.destinations.map((destination) => destination.location),
    ]) {
      if (
        !Number.isFinite(location.lat) ||
        location.lat < -90 ||
        location.lat > 90 ||
        !Number.isFinite(location.lng) ||
        location.lng < -180 ||
        location.lng > 180
      ) {
        throw new RangeError('route matrix contains an invalid latitude/longitude');
      }
    }
  }
}
