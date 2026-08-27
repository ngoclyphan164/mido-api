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

/**
 * Google Places (New) chỉ trả resource name của ảnh, muốn ra URL phải gọi thêm
 * Place Photo. Giữ reference ở đây để chỉ resolve cho những place thật sự được
 * trả về client, thay vì đốt quota cho cả 20 candidate.
 */
export type PlacePhotoRef = {
  name: string;
  widthPx?: number;
  heightPx?: number;
  attributions?: string[];
};

export type PlaceCandidate = {
  provider: string;
  externalId: string;
  name: string;
  /** Chỉ Place Details xin field này; Nearby không có trong field mask. */
  address?: string;
  location: Coordinate;
  primaryType?: string;
  types: string[];
  rating?: number;
  userRatingCount?: number;
  priceLevel?: number;
  photos?: PlacePhotoRef[];
  regularOpeningHours?: {
    periods?: PlaceOpeningPeriod[];
    weekdayDescriptions?: string[];
  };
  mapsUri?: string;
  /** @deprecated Dùng mapsUri; giữ lại để response Google cũ không breaking. */
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
