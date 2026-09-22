import { Injectable } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';

import { DatabaseService } from '../database/database.service';
import { hangouts, participants, picks, suggestions } from '../database/schema';

export type PickView = {
  suggestionId: string;
  participantId: string;
  updatedAt: Date;
};

@Injectable()
export class PickRepository {
  constructor(private readonly database: DatabaseService) {}

  /**
   * Ghi lựa chọn của người gọi trong một kèo, thay cho lựa chọn trước nếu có.
   *
   * `undefined` nghĩa là suggestion không tồn tại, đã bị thay bởi một lần
   * `/suggest` mới (`is_active = false`), không thuộc kèo này, hoặc người gọi
   * chưa nhập vị trí nên chưa phải participant. Cả bốn đều thành 404 ở tầng
   * service — không xác nhận gì với người ngoài cuộc.
   */
  async setPick(
    hangoutId: string,
    userId: string,
    suggestionId: string,
  ): Promise<PickView | undefined> {
    return this.database.db.transaction(async (transaction) => {
      const [eligibility] = await transaction
        .select({ participantId: participants.id })
        .from(suggestions)
        .innerJoin(hangouts, eq(hangouts.id, suggestions.hangoutId))
        .innerJoin(
          participants,
          and(eq(participants.hangoutId, hangouts.id), eq(participants.userId, userId)),
        )
        .where(
          and(
            eq(suggestions.id, suggestionId),
            eq(suggestions.isActive, true),
            eq(hangouts.id, hangoutId),
          ),
        )
        .limit(1)
        .for('update');
      if (!eligibility) return undefined;

      const now = new Date();
      const [pick] = await transaction
        .insert(picks)
        .values({ suggestionId, participantId: eligibility.participantId, updatedAt: now })
        /*
          Conflict rơi vào `picks_participant_uidx`, nên đổi ý là dời lựa chọn
          sang quán khác chứ không thêm lựa chọn thứ hai. Đây là chỗ luật "một
          người một quán" thực sự được giữ.
        */
        .onConflictDoUpdate({
          target: picks.participantId,
          set: { suggestionId, updatedAt: now },
        })
        .returning({
          suggestionId: picks.suggestionId,
          participantId: picks.participantId,
          updatedAt: picks.updatedAt,
        });

      return pick;
    });
  }

  /** Bỏ tick. `false` khi người gọi chưa chọn gì, hoặc không phải participant. */
  async clearPick(hangoutId: string, userId: string): Promise<boolean> {
    const [participant] = await this.database.db
      .select({ id: participants.id })
      .from(participants)
      .where(and(eq(participants.hangoutId, hangoutId), eq(participants.userId, userId)))
      .limit(1);
    if (!participant) return false;

    const deleted = await this.database.db
      .delete(picks)
      .where(eq(picks.participantId, participant.id))
      .returning({ id: picks.id });
    return deleted.length > 0;
  }
}
