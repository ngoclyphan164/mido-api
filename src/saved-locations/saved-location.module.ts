import { Module } from '@nestjs/common';

import { SavedLocationController } from './saved-location.controller';
import { SavedLocationRepository } from './saved-location.repository';
import { SavedLocationService } from './saved-location.service';

@Module({
  controllers: [SavedLocationController],
  providers: [SavedLocationService, SavedLocationRepository],
  // HangoutModule imports this so `PUT /hangouts/:id/participants/me` can accept
  // a savedLocationId. Saved locations depend on nothing but DatabaseService,
  // which is @Global, so there is no cycle.
  exports: [SavedLocationRepository],
})
export class SavedLocationModule {}
