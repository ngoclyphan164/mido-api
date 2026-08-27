import { Module } from '@nestjs/common';

import { SuggestionSnapshotModule } from '../suggestions/suggestion-snapshot.module';
import { FairnessController } from './fairness.controller';
import { FairnessRepository } from './fairness.repository';
import { FairnessService } from './fairness.service';

@Module({
  imports: [SuggestionSnapshotModule],
  controllers: [FairnessController],
  providers: [FairnessRepository, FairnessService],
  exports: [FairnessService],
})
export class FairnessModule {}
