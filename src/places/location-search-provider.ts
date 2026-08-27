import type { Coordinate } from '../midpoint/geometry';

export const LOCATION_SEARCH_PROVIDER = Symbol('LOCATION_SEARCH_PROVIDER');

export type LocationSearchQuery = {
  text: string;
  center?: Coordinate;
  radiusMeters?: number;
  maxResults?: number;
  languageCode?: string;
};

export type LocationSearchCandidate = {
  provider: string;
  externalId: string;
  name: string;
  address?: string;
  location: Coordinate;
  primaryType?: string;
  types: string[];
};

export type LocationSearchResult = {
  places: LocationSearchCandidate[];
};

export interface LocationSearchProvider {
  searchText(query: LocationSearchQuery): Promise<LocationSearchResult>;
}
