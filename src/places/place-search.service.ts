import {
  BadGatewayException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ZodError } from 'zod';

import {
  ProviderCircuitOpenError,
  ProviderQuotaExceededError,
} from '../common/providers/provider-resilience';
import { GoogleMapsConfigurationError, GoogleMapsHttpError } from '../providers/google-maps.client';
import type { SearchLocationQueryDto } from './dto/search-location.dto';
import type { LocationSearchProvider } from './location-search-provider';
import { LOCATION_SEARCH_PROVIDER } from './location-search-provider';
import { placeTypeLabels } from './place-types';

/** Điều khoản Google Maps Platform bắt buộc hiển thị attribution này ở client. */
const GOOGLE_ATTRIBUTION = 'Powered by Google';

@Injectable()
export class PlaceSearchService {
  private readonly logger = new Logger(PlaceSearchService.name);

  constructor(
    @Inject(LOCATION_SEARCH_PROVIDER)
    private readonly locationSearchProvider: LocationSearchProvider,
  ) {}

  async search(query: SearchLocationQueryDto) {
    try {
      const result = await this.locationSearchProvider.searchText({
        text: query.q,
        maxResults: query.limit,
        center:
          query.lat !== undefined && query.lng !== undefined
            ? { lat: query.lat, lng: query.lng }
            : undefined,
        radiusMeters: query.radiusMeters,
      });

      return {
        places: result.places.map((place) => {
          const typeLabels = placeTypeLabels(place.types, place.primaryType);
          return {
            provider: place.provider,
            placeId: place.externalId,
            name: place.name,
            address: place.address,
            location: place.location,
            primaryType: place.primaryType,
            types: place.types,
            primaryTypeLabel: typeLabels[0],
            typeLabels,
          };
        }),
        attribution: GOOGLE_ATTRIBUTION,
      };
    } catch (error) {
      this.rethrowProviderError(error);
    }
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
      this.logger.error(`Google Text Search HTTP ${error.status}: ${error.message}`);
      if (error.status === 401 || error.status === 403) {
        throw new ServiceUnavailableException('Dịch vụ tìm địa điểm chưa được Google cấp quyền');
      }
      if (error.status === 429) {
        throw new HttpException(error.message, HttpStatus.TOO_MANY_REQUESTS);
      }
      throw new BadGatewayException('Provider bản đồ trả về lỗi');
    }
    if (error instanceof ZodError) {
      this.logger.error(`Google Text Search payload không hợp lệ: ${error.message}`);
      throw new BadGatewayException('Provider bản đồ trả về lỗi');
    }
    throw error;
  }
}
