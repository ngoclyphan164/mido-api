import { Module } from '@nestjs/common';

import { PickController } from './pick.controller';
import { PickRepository } from './pick.repository';
import { PickService } from './pick.service';

@Module({ controllers: [PickController], providers: [PickRepository, PickService] })
export class PickModule {}
