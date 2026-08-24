import type { Coordinate } from '../midpoint/geometry';

export const ROUTING_PROVIDER = Symbol('ROUTING_PROVIDER');

export type TravelMode = 'two_wheeler' | 'drive' | 'walk' | 'transit';

export type RouteOrigin = {
  id: string;
  location: Coordinate;
  mode: TravelMode;
};

export type RouteDestination = {
  id: string;
  location: Coordinate;
};

export type RouteMatrixRequest = {
  origins: RouteOrigin[];
  destinations: RouteDestination[];
  departureTime: Date;
};

export type RouteMatrixElement = {
  originId: string;
  destinationId: string;
  mode: TravelMode;
  status: 'ok' | 'unreachable' | 'error';
  durationSec?: number;
  distanceMeters?: number;
  errorCode?: number;
  errorMessage?: string;
};

export type RouteMatrixResult = {
  elements: RouteMatrixElement[];
  storagePolicy: {
    contentMayBeStored: boolean;
  };
};

export interface RoutingProvider {
  computeRouteMatrix(request: RouteMatrixRequest): Promise<RouteMatrixResult>;
}
