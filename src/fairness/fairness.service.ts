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
        throw new NotFoundException('Không tìm thấy kèo hoặc bạn không thuộc nhóm này');
      case 'forbidden':
        throw new ForbiddenException('Chỉ owner hoặc admin mới được chốt địa điểm');
      case 'invalid_suggestion':
        throw new UnprocessableEntityException(
          'Suggestion không thuộc kèo này hoặc không còn active',
        );
      case 'conflict':
        throw new ConflictException('Kèo đã được chốt, hoàn tất hoặc huỷ');
    }
  }

  async complete(hangoutId: string, userId: string, body: CompleteHangoutDto) {
    const happenedAt = body.happenedAt ? new Date(body.happenedAt) : new Date();
    if (happenedAt.getTime() > Date.now() + 5 * 60_000) {
      throw new UnprocessableEntityException('happenedAt không được nằm trong tương lai');
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
        throw new NotFoundException('Không tìm thấy kèo hoặc bạn không thuộc nhóm này');
      case 'forbidden':
        throw new ForbiddenException('Chỉ owner hoặc admin mới được hoàn tất kèo');
      case 'not_decided':
        throw new ConflictException('Kèo chưa được chốt địa điểm');
      case 'participant_mismatch':
        throw new UnprocessableEntityException(
          'actualTravelTimes phải chứa đúng toàn bộ participant của kèo',
        );
      case 'already_completed':
        throw new ConflictException('Kèo đã hoàn tất với thời gian thực tế khác');
    }
  }

  async getGroupFairness(groupId: string, userId: string) {
    const result = await this.repository.getGroupFairness(groupId, userId);
    if (!result) throw new NotFoundException('Không tìm thấy nhóm hoặc bạn không thuộc nhóm này');
    return result;
  }
}
