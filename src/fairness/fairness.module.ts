import { Module } from '@nestjs/common';

import { FairnessController } from './fairness.controller';
import { FairnessRepository } from './fairness.repository';
import { FairnessService } from './fairness.service';

@Module({
  controllers: [FairnessController],
  providers: [FairnessRepository, FairnessService],
  exports: [FairnessService],
})
export class FairnessModule {}
