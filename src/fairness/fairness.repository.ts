import { Injectable } from '@nestjs/common';
import { and, eq, inArray, sql } from 'drizzle-orm';

import { DatabaseService } from '../database/database.service';
import {
  fairnessLedger,
  groupMembers,
  hangouts,
  outings,
  participants,
  profiles,
  suggestions,
} from '../database/schema';
import { calculateFairnessDeltas } from './fairness';

type OutingView = {
  id: string;
  hangoutId: string;
  chosenSuggestionId: string | null;
  decidedBy: string | null;
  decidedAt: Date;
  happenedAt: Date | null;
};

export type DecideResult =
  | { kind: 'ok'; outing: OutingView }
  | { kind: 'not_found' | 'forbidden' | 'invalid_suggestion' | 'conflict' };

export type CompleteResult =
  | {
      kind: 'ok';
      outing: OutingView;
      meanActualDurationSec: number;
      ledger: Array<{
        participantId: string;
        userId: string;
        actualDurationSec: number;
        deltaSeconds: number;
        debtSeconds: number;
      }>;
    }
  | {
      kind:
        'not_found' | 'forbidden' | 'not_decided' | 'participant_mismatch' | 'already_completed';
    };

type SubmittedTravelTime = { participantId: string; durationSec: number };

const outingSelection = {
  id: outings.id,
  hangoutId: outings.hangoutId,
  chosenSuggestionId: outings.chosenSuggestionId,
  decidedBy: outings.decidedBy,
  decidedAt: outings.decidedAt,
  happenedAt: outings.happenedAt,
};

@Injectable()
export class FairnessRepository {
  constructor(private readonly database: DatabaseService) {}

  async decide(hangoutId: string, userId: string, suggestionId: string): Promise<DecideResult> {
    return this.database.db.transaction(async (transaction) => {
      const [authorized] = await transaction
        .select({ status: hangouts.status, role: groupMembers.role })
        .from(hangouts)
        .innerJoin(
          groupMembers,
          and(eq(groupMembers.groupId, hangouts.groupId), eq(groupMembers.userId, userId)),
        )
        .where(eq(hangouts.id, hangoutId))
        .limit(1)
        .for('update');
      if (!authorized) return { kind: 'not_found' };
      if (authorized.role === 'member') return { kind: 'forbidden' };

      const [existing] = await transaction
        .select(outingSelection)
        .from(outings)
        .where(eq(outings.hangoutId, hangoutId))
        .limit(1);
      if (existing) {
        return existing.chosenSuggestionId === suggestionId
          ? { kind: 'ok', outing: existing }
          : { kind: 'conflict' };
      }
      if (
        authorized.status === 'decided' ||
        authorized.status === 'done' ||
        authorized.status === 'cancelled'
      ) {
        return { kind: 'conflict' };
      }

      const [suggestion] = await transaction
        .select({ id: suggestions.id })
        .from(suggestions)
        .where(
          and(
            eq(suggestions.id, suggestionId),
            eq(suggestions.hangoutId, hangoutId),
            eq(suggestions.isActive, true),
          ),
        )
        .limit(1);
      if (!suggestion) return { kind: 'invalid_suggestion' };

      const now = new Date();
      const [outing] = await transaction
        .insert(outings)
        .values({
          hangoutId,
          chosenSuggestionId: suggestionId,
          decidedBy: userId,
          decidedAt: now,
          updatedAt: now,
        })
        .returning(outingSelection);
      await transaction
        .update(hangouts)
        .set({ status: 'decided', updatedAt: now })
        .where(eq(hangouts.id, hangoutId));

      return { kind: 'ok', outing: outing! };
    });
  }

  async complete(
    hangoutId: string,
    userId: string,
    happenedAt: Date,
    submittedTravelTimes: readonly SubmittedTravelTime[],
  ): Promise<CompleteResult> {
    return this.database.db.transaction(async (transaction) => {
      const [authorized] = await transaction
        .select({ groupId: hangouts.groupId, role: groupMembers.role })
        .from(hangouts)
        .innerJoin(
          groupMembers,
          and(eq(groupMembers.groupId, hangouts.groupId), eq(groupMembers.userId, userId)),
        )
        .where(eq(hangouts.id, hangoutId))
        .limit(1)
        .for('update');
      if (!authorized) return { kind: 'not_found' };
      if (authorized.role === 'member') return { kind: 'forbidden' };

      const [outing] = await transaction
        .select(outingSelection)
        .from(outings)
        .where(eq(outings.hangoutId, hangoutId))
        .limit(1)
        .for('update');
      if (!outing) return { kind: 'not_decided' };

      const participantRows = await transaction
        .select({ id: participants.id, userId: participants.userId })
        .from(participants)
        .where(eq(participants.hangoutId, hangoutId))
        .orderBy(participants.id);
      const submittedByParticipant = new Map(
        submittedTravelTimes.map((travelTime) => [travelTime.participantId, travelTime]),
      );
      if (
        submittedByParticipant.size !== participantRows.length ||
        participantRows.some((participant) => !submittedByParticipant.has(participant.id))
      ) {
        return { kind: 'participant_mismatch' };
      }

      const actualTravelTimes = participantRows.map((participant) => ({
        participantId: participant.id,
        userId: participant.userId,
        durationSeconds: submittedByParticipant.get(participant.id)!.durationSec,
      }));
      const calculated = calculateFairnessDeltas(actualTravelTimes);

      if (outing.happenedAt) {
        const stored = await transaction
          .select({
            userId: fairnessLedger.userId,
            actualDurationSeconds: fairnessLedger.actualDurationSeconds,
          })
          .from(fairnessLedger)
          .where(eq(fairnessLedger.outingId, outing.id));
        const durationByUser = new Map(
          stored.map((entry) => [entry.userId, entry.actualDurationSeconds]),
        );
        if (
          actualTravelTimes.some(
            (entry) => durationByUser.get(entry.userId) !== entry.durationSeconds,
          )
        ) {
          return { kind: 'already_completed' };
        }
      } else {
        await transaction.insert(fairnessLedger).values(
          calculated.entries.map((entry) => ({
            groupId: authorized.groupId,
            userId: entry.userId,
            outingId: outing.id,
            actualDurationSeconds: entry.durationSeconds,
            deltaSeconds: entry.deltaSeconds,
          })),
        );
        const now = new Date();
        await transaction
          .update(outings)
          .set({ happenedAt, updatedAt: now })
          .where(eq(outings.id, outing.id));
        await transaction
          .update(hangouts)
          .set({ status: 'done', updatedAt: now })
          .where(eq(hangouts.id, hangoutId));
        outing.happenedAt = happenedAt;
      }

      const userIds = actualTravelTimes.map((entry) => entry.userId);
      const debtRows = await transaction
        .select({
          userId: fairnessLedger.userId,
          debtSeconds: sql<number>`coalesce(sum(${fairnessLedger.deltaSeconds}), 0)::int`,
        })
        .from(fairnessLedger)
        .where(
          and(
            eq(fairnessLedger.groupId, authorized.groupId),
            inArray(fairnessLedger.userId, userIds),
          ),
        )
        .groupBy(fairnessLedger.userId);
      const debtByUser = new Map(
        debtRows.map((entry) => [entry.userId, Number(entry.debtSeconds)]),
      );

      return {
        kind: 'ok',
        outing,
        meanActualDurationSec: calculated.meanDurationSeconds,
        ledger: calculated.entries.map((entry) => ({
          participantId: entry.participantId,
          userId: entry.userId,
          actualDurationSec: entry.durationSeconds,
          deltaSeconds: entry.deltaSeconds,
          debtSeconds: debtByUser.get(entry.userId) ?? 0,
        })),
      };
    });
  }

  async getGroupFairness(groupId: string, userId: string) {
    const [membership] = await this.database.db
      .select({ groupId: groupMembers.groupId })
      .from(groupMembers)
      .where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.userId, userId)))
      .limit(1);
    if (!membership) return undefined;

    const members = await this.database.db
      .select({
        userId: groupMembers.userId,
        displayName: profiles.displayName,
        debtSeconds: sql<number>`coalesce(sum(${fairnessLedger.deltaSeconds}), 0)::int`,
        outingsCompleted: sql<number>`count(${fairnessLedger.id})::int`,
      })
      .from(groupMembers)
      .innerJoin(profiles, eq(profiles.id, groupMembers.userId))
      .leftJoin(
        fairnessLedger,
        and(
          eq(fairnessLedger.groupId, groupMembers.groupId),
          eq(fairnessLedger.userId, groupMembers.userId),
        ),
      )
      .where(eq(groupMembers.groupId, groupId))
      .groupBy(groupMembers.userId, profiles.displayName)
      .orderBy(profiles.displayName, groupMembers.userId);

    return {
      groupId,
      members: members.map((member) => ({
        ...member,
        debtSeconds: Number(member.debtSeconds),
        outingsCompleted: Number(member.outingsCompleted),
      })),
    };
  }
}
