import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';

import { SuggestionSnapshotService } from '../suggestions/suggestion-snapshot.service';
import type { CompleteHangoutDto } from './dto/fairness.dto';
import { FairnessRepository } from './fairness.repository';

@Injectable()
export class FairnessService {
  constructor(
    private readonly repository: FairnessRepository,
    private readonly snapshots: SuggestionSnapshotService,
  ) {}

  async decide(hangoutId: string, userId: string, suggestionId: string) {
    const result = await this.repository.decide(hangoutId, userId, suggestionId);
    switch (result.kind) {
      case 'ok':
        // Sau khi transaction commit, không phải trong nó: đây là một call HTTP
        // ra Google, không được giữ lock hàng `hangouts` trong lúc chờ.
        await this.snapshots.captureChosen(hangoutId);
        return { outing: result.outing };
      case 'not_found':
        throw new NotFoundException('Hangout not found, or you are not a member of its group');
      case 'forbidden':
        throw new ForbiddenException('Only a group owner or admin can decide the place');
      case 'invalid_suggestion':
        throw new UnprocessableEntityException(
          'Suggestion does not belong to this hangout, or is no longer active',
        );
      case 'conflict':
        throw new ConflictException('This hangout is already decided, completed or cancelled');
    }
  }

  async complete(hangoutId: string, userId: string, body: CompleteHangoutDto) {
    const happenedAt = body.happenedAt ? new Date(body.happenedAt) : new Date();
    if (happenedAt.getTime() > Date.now() + 5 * 60_000) {
      throw new UnprocessableEntityException('happenedAt cannot be in the future');
    }

    const result = await this.repository.complete(
      hangoutId,
      userId,
      happenedAt,
      body.actualTravelTimes,
    );
    switch (result.kind) {
      case 'ok':
        return {
          outing: result.outing,
          meanActualDurationSec: result.meanActualDurationSec,
          ledger: result.ledger,
        };
      case 'not_found':
        throw new NotFoundException('Hangout not found, or you are not a member of its group');
      case 'forbidden':
        throw new ForbiddenException('Only a group owner or admin can complete the hangout');
      case 'not_decided':
        throw new ConflictException('This hangout has no decided place yet');
      case 'participant_mismatch':
        throw new UnprocessableEntityException(
          'actualTravelTimes must cover exactly every participant of the hangout',
        );
      case 'already_completed':
        throw new ConflictException(
          'This hangout was already completed with different actual travel times',
        );
    }
  }

  async getGroupFairness(groupId: string, userId: string) {
    const result = await this.repository.getGroupFairness(groupId, userId);
    if (!result) throw new NotFoundException('Group not found, or you are not a member of it');
    return result;
  }
}
