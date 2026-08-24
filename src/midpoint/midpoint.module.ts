import { Module } from '@nestjs/common';

import { MidpointController } from './midpoint.controller';

@Module({ controllers: [MidpointController] })
export class MidpointModule {}
