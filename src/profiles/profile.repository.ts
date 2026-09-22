import { Injectable } from '@nestjs/common';
import { and, eq, inArray } from 'drizzle-orm';

import { DatabaseService } from '../database/database.service';
import { hangouts, participants, profiles } from '../database/schema';

export type TravelMode = 'two_wheeler' | 'drive' | 'walk' | 'transit';

export type ProfileView = {
  id: string;
  displayName: string;
  avatarUrl: string | null;
  defaultTravelMode: TravelMode;
  createdAt: Date;
  updatedAt: Date;
};

export type ProfilePatch = {
  displayName?: string;
  avatarUrl?: string | null;
  defaultTravelMode?: TravelMode;
};

/** Identity facts used only when a profile row has to be healed into existence. */
export type ProfileSeed = { email?: string; isAnonymous: boolean };

/**
 * Renaming rewrites the snapshot on kèo still in play. A kèo that is `done` or
 * `cancelled` keeps the name it was travelled under — that row is history, and
 * the fairness ledger reads alongside it.
 */
const RENAMEABLE_STATUSES = ['draft', 'voting', 'decided'] as const;

@Injectable()
export class ProfileRepository {
  constructor(private readonly database: DatabaseService) {}

  async find(userId: string): Promise<ProfileView | undefined> {
    const [row] = await this.database.db
      .select()
      .from(profiles)
      .where(eq(profiles.id, userId))
      .limit(1);
    return row;
  }

  /**
   * The `on_auth_user_created` trigger normally writes this row, so a miss means
   * either a user that predates the trigger or a trigger failure. Healing it
   * here mirrors that function's fallback chain (migration 0000). The FK to
   * `auth.users` is what makes the insert safe: it can only succeed for a real
   * identity, so a forged user id fails rather than creating a phantom profile.
   */
  async findOrCreate(userId: string, seed: ProfileSeed): Promise<ProfileView> {
    const existing = await this.find(userId);
    if (existing) return existing;

    const displayName = (
      (seed.isAnonymous ? 'Guest' : undefined) ??
      seed.email?.split('@')[0]?.trim() ??
      'Member'
    ).slice(0, 100);

    await this.database.db
      .insert(profiles)
      .values({ id: userId, displayName: displayName || 'Member' })
      .onConflictDoNothing();

    // Re-read rather than trusting `returning`: a concurrent request may have
    // won the insert, in which case its row is the one to hand back.
    const created = await this.find(userId);
    if (!created) throw new Error('Could not create a profile for the current user');
    return created;
  }

  /**
   * Returns undefined when the row vanished mid-update — the caller heals it
   * first, so in practice that only happens if the account was deleted between
   * the two statements.
   */
  async update(userId: string, patch: ProfilePatch): Promise<ProfileView | undefined> {
    return this.database.db.transaction(async (tx) => {
      const [updated] = await tx
        .update(profiles)
        .set({
          ...(patch.displayName === undefined ? null : { displayName: patch.displayName }),
          ...(patch.avatarUrl === undefined ? null : { avatarUrl: patch.avatarUrl }),
          ...(patch.defaultTravelMode === undefined
            ? null
            : { defaultTravelMode: patch.defaultTravelMode }),
          updatedAt: new Date(),
        })
        .where(eq(profiles.id, userId))
        .returning();

      if (!updated) return undefined;

      if (patch.displayName !== undefined) {
        // `participants.display_name` is copied at upsert time, so without this
        // a rename looks half-applied: the profile changes, every open kèo does
        // not. `participants` is in the Realtime publication with REPLICA
        // IDENTITY FULL (migration 0008), so mounted screens redraw on their own.
        await tx
          .update(participants)
          .set({ displayName: patch.displayName, updatedAt: new Date() })
          .where(
            and(
              eq(participants.userId, userId),
              inArray(
                participants.hangoutId,
                tx
                  .select({ id: hangouts.id })
                  .from(hangouts)
                  .where(inArray(hangouts.status, [...RENAMEABLE_STATUSES])),
              ),
            ),
          );
      }

      return updated;
    });
  }
}
