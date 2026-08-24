import type { Coordinate } from '../midpoint/geometry';

export const PLACES_PROVIDER = Symbol('PLACES_PROVIDER');

export type ProviderStoragePolicy = {
  identityMayBeStored: boolean;
  contentMayBeStored: boolean;
};

export type PlaceOpeningPeriod = {
  open: { day: number; hour: number; minute: number };
  close?: { day: number; hour: number; minute: number };
};

export type PlaceCandidate = {
  provider: string;
  externalId: string;
  name: string;
  location: Coordinate;
  primaryType?: string;
  types: string[];
  rating?: number;
  userRatingCount?: number;
  priceLevel?: number;
  regularOpeningHours?: {
    periods?: PlaceOpeningPeriod[];
    weekdayDescriptions?: string[];
  };
  googleMapsUri?: string;
  businessStatus?: string;
  utcOffsetMinutes?: number;
};

export type NearbyPlacesQuery = {
  center: Coordinate;
  radiusMeters: number;
  includedTypes: string[];
  maxResults?: number;
  rankPreference?: 'distance' | 'popularity';
  languageCode?: string;
  regionCode?: string;
};

export type NearbyPlacesResult = {
  places: PlaceCandidate[];
  snappedCenter: Coordinate;
  searchCell: string;
  storagePolicy: ProviderStoragePolicy;
};

export interface PlacesProvider {
  searchNearby(query: NearbyPlacesQuery): Promise<NearbyPlacesResult>;
}
