import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';

import {
  SAVED_LOCATION_LIMIT,
  SavedLocationRepository,
  type CreateSavedLocationInput,
  type SavedLocationView,
  type UpdateSavedLocationInput,
} from './saved-location.repository';

@Injectable()
export class SavedLocationService {
  constructor(private readonly repository: SavedLocationRepository) {}

  list(userId: string): Promise<SavedLocationView[]> {
    return this.repository.listForUser(userId);
  }

  async create(userId: string, input: CreateSavedLocationInput): Promise<SavedLocationView> {
    const result = await this.repository.create(userId, input);
    switch (result.kind) {
      case 'ok':
        return result.location;
      case 'limit_reached':
        throw new ConflictException(`Bạn chỉ lưu được tối đa ${SAVED_LOCATION_LIMIT} địa điểm`);
      case 'duplicate_label':
        throw new ConflictException('Bạn đã lưu một địa điểm cùng tên rồi');
    }
  }

  async update(
    id: string,
    userId: string,
    input: UpdateSavedLocationInput,
  ): Promise<SavedLocationView> {
    const result = await this.repository.update(id, userId, input);
    switch (result.kind) {
      case 'ok':
        return result.location;
      case 'duplicate_label':
        throw new ConflictException('Bạn đã lưu một địa điểm cùng tên rồi');
      case 'not_found':
        throw new NotFoundException('Không tìm thấy địa điểm đã lưu');
    }
  }

  /**
   * 404 chứ không bao giờ 403 khi địa điểm thuộc về người khác — trả lời khác
   * nhau cho "không tồn tại" và "không phải của bạn" là xác nhận id nào có thật.
   */
  async remove(id: string, userId: string): Promise<void> {
    const removed = await this.repository.remove(id, userId);
    if (!removed) throw new NotFoundException('Không tìm thấy địa điểm đã lưu');
  }
}
