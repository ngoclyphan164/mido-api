import { Module } from '@nestjs/common';

import { GoogleMapsModule } from '../providers/google-maps.module';
import { GooglePlacesProvider } from './google-places.provider';
import { PLACES_PROVIDER } from './places-provider';

@Module({
  imports: [GoogleMapsModule],
  providers: [
    GooglePlacesProvider,
    { provide: PLACES_PROVIDER, useExisting: GooglePlacesProvider },
  ],
  exports: [PLACES_PROVIDER],
})
export class PlacesModule {}
