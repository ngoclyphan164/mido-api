import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { SavedLocationRepository } from '../saved-locations/saved-location.repository';
import { SuggestionSnapshotService } from '../suggestions/suggestion-snapshot.service';
import type {
  CreateHangoutInput,
  UpdateHangoutInput,
  UpsertParticipantInput,
} from './hangout.repository';
import { HangoutRepository } from './hangout.repository';

/**
 * Đúng một trong hai đường vào, DTO đã ép bằng superRefine: toạ độ thô, hoặc id
 * của một địa điểm đã lưu.
 */
export type UpsertOwnParticipantInput = Omit<UpsertParticipantInput, 'lat' | 'lng'> & {
  lat?: number;
  lng?: number;
  savedLocationId?: string;
};

@Injectable()
export class HangoutService {
  constructor(
    private readonly repository: HangoutRepository,
    private readonly snapshots: SuggestionSnapshotService,
    private readonly savedLocations: SavedLocationRepository,
  ) {}

  async create(groupId: string, userId: string, input: CreateHangoutInput) {
    if (!(await this.repository.isGroupMember(groupId, userId))) {
      throw new NotFoundException('Không tìm thấy nhóm hoặc bạn không thuộc nhóm này');
    }
    const hangoutId = await this.repository.create(groupId, userId, input);
    return this.detail(hangoutId, userId);
  }

  async listForGroup(groupId: string, userId: string) {
    if (!(await this.repository.isGroupMember(groupId, userId))) {
      throw new NotFoundException('Không tìm thấy nhóm hoặc bạn không thuộc nhóm này');
    }
    return this.repository.listForGroup(groupId);
  }

  async detail(hangoutId: string, userId: string) {
    const hangout = await this.repository.findDetail(hangoutId, userId);
    if (!hangout) throw new NotFoundException('Không tìm thấy kèo hoặc bạn không thuộc nhóm này');
    // Chỉ kèo đã chốt mới có địa điểm để trả; kèo đang lên không đụng tới
    // bảng snapshot lẫn Google.
    if (!hangout.outing) return hangout;

    return {
      ...hangout,
      outing: {
        ...hangout.outing,
        place: await this.snapshots.getChosenForHangout(hangoutId),
      },
    };
  }

  async update(hangoutId: string, userId: string, input: UpdateHangoutInput) {
    const result = await this.repository.update(hangoutId, userId, input);
    switch (result.kind) {
      case 'ok':
        return result.hangout;
      case 'forbidden':
        throw new ForbiddenException('Chỉ người tạo kèo hoặc owner/admin mới được sửa kèo');
      case 'immutable':
        throw new ConflictException(`Không thể sửa kèo đang ở trạng thái ${result.status}`);
      case 'not_found':
        throw new NotFoundException('Không tìm thấy kèo hoặc bạn không thuộc nhóm này');
    }
  }

  async remove(hangoutId: string, userId: string): Promise<void> {
    const result = await this.repository.remove(hangoutId, userId);
    switch (result.kind) {
      case 'ok':
        return;
      case 'forbidden':
        throw new ForbiddenException('Chỉ người tạo kèo hoặc owner/admin mới được xóa kèo');
      case 'immutable':
        throw new ConflictException(
          `Không thể xóa kèo đang ở trạng thái ${result.status} vì có dữ liệu outing/fairness`,
        );
      case 'not_found':
        throw new NotFoundException('Không tìm thấy kèo hoặc bạn không thuộc nhóm này');
    }
  }

  async upsertOwnParticipant(hangoutId: string, userId: string, input: UpsertOwnParticipantInput) {
    // Reuse the detail read for its membership check, and to refuse edits once
    // the kèo has moved past planning.
    const hangout = await this.detail(hangoutId, userId);
    if (hangout.status === 'done' || hangout.status === 'cancelled') {
      throw new ForbiddenException(
        `Không sửa được vị trí khi kèo đang ở trạng thái ${hangout.status}`,
      );
    }

    const resolved = await this.resolveOrigin(userId, input);

    const participant = await this.repository.upsertOwnParticipant(hangoutId, userId, resolved);
    if (!participant) throw new NotFoundException('Không tìm thấy profile của bạn');
    return participant;
  }

  /**
   * Địa điểm đã lưu mang sẵn địa chỉ, nên chọn "Nhà" điền được cả toạ độ lẫn
   * `originAddress` mà không phải geocode ngược lần nữa. Body vẫn ghi đè được
   * địa chỉ, cho trường hợp người dùng sửa tay sau khi chọn.
   */
  private async resolveOrigin(
    userId: string,
    input: UpsertOwnParticipantInput,
  ): Promise<UpsertParticipantInput> {
    const { savedLocationId, ...rest } = input;

    if (savedLocationId === undefined) {
      // DTO đã bảo đảm có cả hai khi không gửi savedLocationId.
      return { ...rest, lat: rest.lat!, lng: rest.lng! };
    }

    const saved = await this.savedLocations.findOwned(savedLocationId, userId);
    if (!saved) throw new NotFoundException('Không tìm thấy địa điểm đã lưu');

    return {
      ...rest,
      lat: saved.location.lat,
      lng: saved.location.lng,
      originAddress: rest.originAddress ?? saved.address,
    };
  }
}
