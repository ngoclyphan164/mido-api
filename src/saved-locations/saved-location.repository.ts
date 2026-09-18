import { Injectable } from '@nestjs/common';
import { and, asc, eq, sql } from 'drizzle-orm';

import { DatabaseService } from '../database/database.service';
import { geographyLat, geographyLng, toGeographyPoint } from '../database/geography';
import { savedLocations } from '../database/schema';

/** Đủ cho nhà, công ty, trường, nhà bạn gái — quá số này là danh sách, không phải lối tắt. */
export const SAVED_LOCATION_LIMIT = 20;

export type SavedLocationView = {
  id: string;
  label: string;
  location: { lat: number; lng: number };
  address: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type CreateSavedLocationInput = {
  label: string;
  lat: number;
  lng: number;
  address?: string;
};

export type UpdateSavedLocationInput = {
  label?: string;
  lat?: number;
  lng?: number;
  address?: string | null;
};

export type CreateSavedLocationResult =
  | { kind: 'ok'; location: SavedLocationView }
  | { kind: 'limit_reached' }
  | { kind: 'duplicate_label' };

export type UpdateSavedLocationResult =
  { kind: 'ok'; location: SavedLocationView } | { kind: 'not_found' } | { kind: 'duplicate_label' };

const lat = geographyLat(savedLocations.geog);
const lng = geographyLng(savedLocations.geog);

const columns = {
  id: savedLocations.id,
  label: savedLocations.label,
  address: savedLocations.address,
  createdAt: savedLocations.createdAt,
  updatedAt: savedLocations.updatedAt,
  lat,
  lng,
};

type Row = {
  id: string;
  label: string;
  address: string | null;
  createdAt: Date;
  updatedAt: Date;
  lat: number;
  lng: number;
};

function toView(row: Row): SavedLocationView {
  return {
    id: row.id,
    label: row.label,
    location: { lat: Number(row.lat), lng: Number(row.lng) },
    address: row.address,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

@Injectable()
export class SavedLocationRepository {
  constructor(private readonly database: DatabaseService) {}

  async listForUser(userId: string): Promise<SavedLocationView[]> {
    const rows = await this.database.db
      .select(columns)
      .from(savedLocations)
      .where(eq(savedLocations.userId, userId))
      .orderBy(asc(savedLocations.label));
    return rows.map(toView);
  }

  /** Mọi truy vấn đều mang mệnh đề `user_id = caller`; đó là toàn bộ authorization ở đây. */
  async findOwned(id: string, userId: string): Promise<SavedLocationView | undefined> {
    const [row] = await this.database.db
      .select(columns)
      .from(savedLocations)
      .where(and(eq(savedLocations.id, id), eq(savedLocations.userId, userId)))
      .limit(1);
    return row ? toView(row) : undefined;
  }

  async create(
    userId: string,
    input: CreateSavedLocationInput,
  ): Promise<CreateSavedLocationResult> {
    return this.database.db.transaction(async (tx) => {
      const [counted] = await tx
        .select({ count: sql<number>`count(*)::int` })
        .from(savedLocations)
        .where(eq(savedLocations.userId, userId));
      const count = Number(counted?.count ?? 0);

      // READ COMMITTED: hai request đồng thời ở mốc 19 có thể cùng qua và thành
      // 21 hàng. Hậu quả là một địa điểm thừa mà không ai để ý, nên không đáng
      // khoá bảng để chặn.
      if (count >= SAVED_LOCATION_LIMIT) return { kind: 'limit_reached' };

      try {
        const [row] = await tx
          .insert(savedLocations)
          .values({
            userId,
            label: input.label,
            geog: toGeographyPoint({ lat: input.lat, lng: input.lng }),
            address: input.address ?? null,
          })
          .returning(columns);
        if (!row) throw new Error('Không lưu được địa điểm');
        return { kind: 'ok', location: toView(row) };
      } catch (error) {
        if (isDuplicateLabel(error)) return { kind: 'duplicate_label' };
        throw error;
      }
    });
  }

  async update(
    id: string,
    userId: string,
    input: UpdateSavedLocationInput,
  ): Promise<UpdateSavedLocationResult> {
    const geog =
      input.lat === undefined || input.lng === undefined
        ? undefined
        : toGeographyPoint({ lat: input.lat, lng: input.lng });

    try {
      const [row] = await this.database.db
        .update(savedLocations)
        .set({
          ...(input.label === undefined ? null : { label: input.label }),
          ...(geog === undefined ? null : { geog }),
          ...(input.address === undefined ? null : { address: input.address }),
          updatedAt: new Date(),
        })
        .where(and(eq(savedLocations.id, id), eq(savedLocations.userId, userId)))
        .returning(columns);

      return row ? { kind: 'ok', location: toView(row) } : { kind: 'not_found' };
    } catch (error) {
      if (isDuplicateLabel(error)) return { kind: 'duplicate_label' };
      throw error;
    }
  }

  async remove(id: string, userId: string): Promise<boolean> {
    const [deleted] = await this.database.db
      .delete(savedLocations)
      .where(and(eq(savedLocations.id, id), eq(savedLocations.userId, userId)))
      .returning({ id: savedLocations.id });
    return Boolean(deleted);
  }
}

function isDuplicateLabel(error: unknown): boolean {
  const candidate = error as { code?: string; constraint_name?: string } | null;
  return (
    candidate?.code === '23505' &&
    (candidate.constraint_name === undefined ||
      candidate.constraint_name === 'saved_locations_user_label_uidx')
  );
}
