import { Module } from '@nestjs/common';

import { PlacesModule } from '../places/places.module';
import { RoutingModule } from '../routing/routing.module';
import { SuggestionController } from './suggestion.controller';
import { SuggestionRepository } from './suggestion.repository';
import { SuggestionService } from './suggestion.service';

@Module({
  imports: [PlacesModule, RoutingModule],
  controllers: [SuggestionController],
  providers: [SuggestionRepository, SuggestionService],
  exports: [SuggestionService],
})
export class SuggestionModule {}
