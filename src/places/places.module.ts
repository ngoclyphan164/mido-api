import { Module } from '@nestjs/common';

import { GoogleMapsModule } from '../providers/google-maps.module';
import { GooglePlaceDetailsProvider } from './google-place-details.provider';
import { GooglePlacePhotosProvider } from './google-place-photos.provider';
import { GooglePlacesProvider } from './google-places.provider';
import { GoogleTextSearchProvider } from './google-text-search.provider';
import { LOCATION_SEARCH_PROVIDER } from './location-search-provider';
import { PLACE_DETAILS_PROVIDER } from './place-details-provider';
import { PLACE_PHOTO_PROVIDER } from './place-photo-provider';
import { PlaceSearchController } from './place-search.controller';
import { PlaceSearchService } from './place-search.service';
import { PLACES_PROVIDER } from './places-provider';

@Module({
  imports: [GoogleMapsModule],
  controllers: [PlaceSearchController],
  providers: [
    GooglePlacesProvider,
    { provide: PLACES_PROVIDER, useExisting: GooglePlacesProvider },
    GoogleTextSearchProvider,
    { provide: LOCATION_SEARCH_PROVIDER, useExisting: GoogleTextSearchProvider },
    GooglePlacePhotosProvider,
    { provide: PLACE_PHOTO_PROVIDER, useExisting: GooglePlacePhotosProvider },
    GooglePlaceDetailsProvider,
    { provide: PLACE_DETAILS_PROVIDER, useExisting: GooglePlaceDetailsProvider },
    PlaceSearchService,
  ],
  exports: [PLACES_PROVIDER, PLACE_PHOTO_PROVIDER, PLACE_DETAILS_PROVIDER],
})
export class PlacesModule {}
