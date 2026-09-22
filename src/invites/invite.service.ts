import { GoneException, Injectable, NotFoundException } from '@nestjs/common';

import { InviteRepository, type InvitePreviewView } from './invite.repository';

@Injectable()
export class InviteService {
  constructor(private readonly repository: InviteRepository) {}

  /**
   * Thông điệp lỗi trùng đúng với `GroupService.join` để client chỉ phải học một
   * bộ từ vựng cho cả màn xem trước lẫn lúc vào nhóm thật.
   */
  async preview(code: string): Promise<InvitePreviewView> {
    const result = await this.repository.preview(code);
    switch (result.kind) {
      case 'ok':
        return result.preview;
      case 'expired':
        throw new GoneException('This invite link has expired; ask the group owner for a new one');
      case 'not_found':
        throw new NotFoundException('Invalid invite code');
    }
  }
}
