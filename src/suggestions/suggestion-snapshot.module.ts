import { Module } from '@nestjs/common';

import { PlacesModule } from '../places/places.module';
import { SuggestionSnapshotRepository } from './suggestion-snapshot.repository';
import { SuggestionSnapshotService } from './suggestion-snapshot.service';

/**
 * Tách khỏi `SuggestionModule` để hangout/fairness đọc được snapshot mà không
 * kéo theo cả pipeline `/suggest` (và các provider tính tiền của nó).
 */
@Module({
  imports: [PlacesModule],
  providers: [SuggestionSnapshotRepository, SuggestionSnapshotService],
  exports: [SuggestionSnapshotRepository, SuggestionSnapshotService],
})
export class SuggestionSnapshotModule {}
