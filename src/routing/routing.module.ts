import { Module } from '@nestjs/common';

import { GoogleMapsModule } from '../providers/google-maps.module';
import { GoogleRoutesProvider } from './google-routes.provider';
import { ROUTING_PROVIDER } from './routing-provider';

@Module({
  imports: [GoogleMapsModule],
  providers: [
    GoogleRoutesProvider,
    { provide: ROUTING_PROVIDER, useExisting: GoogleRoutesProvider },
  ],
  exports: [ROUTING_PROVIDER],
})
export class RoutingModule {}
