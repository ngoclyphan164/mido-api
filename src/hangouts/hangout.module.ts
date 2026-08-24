import { Module } from '@nestjs/common';

import { HangoutController } from './hangout.controller';
import { HangoutRepository } from './hangout.repository';
import { HangoutService } from './hangout.service';

@Module({
  controllers: [HangoutController],
  providers: [HangoutService, HangoutRepository],
  exports: [HangoutRepository],
})
export class HangoutModule {}
