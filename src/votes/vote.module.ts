import { Module } from '@nestjs/common';

import { VoteController } from './vote.controller';
import { VoteRepository } from './vote.repository';
import { VoteService } from './vote.service';

@Module({ controllers: [VoteController], providers: [VoteRepository, VoteService] })
export class VoteModule {}
