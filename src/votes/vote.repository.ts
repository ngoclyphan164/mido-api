import { Injectable } from '@nestjs/common';
import { and, eq, sql } from 'drizzle-orm';

import { DatabaseService } from '../database/database.service';
import { hangouts, participants, suggestions, votes } from '../database/schema';

export type VoteValue = 'up' | 'down' | 'veto';

export type VoteResult = {
  vote: {
    id: string;
    suggestionId: string;
    participantId: string;
    value: VoteValue;
    updatedAt: Date;
  };
  tally: { up: number; down: number; veto: number; total: number };
};

@Injectable()
export class VoteRepository {
  constructor(private readonly database: DatabaseService) {}

  async castVote(
    suggestionId: string,
    userId: string,
    value: VoteValue,
  ): Promise<VoteResult | undefined> {
    return this.database.db.transaction(async (transaction) => {
      const [eligibility] = await transaction
        .select({ participantId: participants.id })
        .from(suggestions)
        .innerJoin(hangouts, eq(hangouts.id, suggestions.hangoutId))
        .innerJoin(
          participants,
          and(eq(participants.hangoutId, hangouts.id), eq(participants.userId, userId)),
        )
        .where(and(eq(suggestions.id, suggestionId), eq(suggestions.isActive, true)))
        .limit(1)
        .for('update');
      if (!eligibility) return undefined;

      const now = new Date();
      const [vote] = await transaction
        .insert(votes)
        .values({
          suggestionId,
          participantId: eligibility.participantId,
          value,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: [votes.suggestionId, votes.participantId],
          set: { value, updatedAt: now },
        })
        .returning({
          id: votes.id,
          suggestionId: votes.suggestionId,
          participantId: votes.participantId,
          value: votes.value,
          updatedAt: votes.updatedAt,
        });
      const [tally] = await transaction
        .select({
          up: sql<number>`count(*) filter (where ${votes.value} = 'up')::int`,
          down: sql<number>`count(*) filter (where ${votes.value} = 'down')::int`,
          veto: sql<number>`count(*) filter (where ${votes.value} = 'veto')::int`,
          total: sql<number>`count(*)::int`,
        })
        .from(votes)
        .where(eq(votes.suggestionId, suggestionId));

      return { vote: vote!, tally: tally! };
    });
  }
}
