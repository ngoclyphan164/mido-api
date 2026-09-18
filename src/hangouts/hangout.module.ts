import { Module } from '@nestjs/common';

import { SavedLocationModule } from '../saved-locations/saved-location.module';
import { SuggestionSnapshotModule } from '../suggestions/suggestion-snapshot.module';
import { HangoutController } from './hangout.controller';
import { HangoutRepository } from './hangout.repository';
import { HangoutService } from './hangout.service';

@Module({
  imports: [SuggestionSnapshotModule, SavedLocationModule],
  controllers: [HangoutController],
  providers: [HangoutService, HangoutRepository],
  exports: [HangoutRepository],
})
export class HangoutModule {}
