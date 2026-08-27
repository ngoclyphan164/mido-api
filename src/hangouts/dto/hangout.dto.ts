import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

import { placeTypesForActivity } from '../../suggestions/activity';

export class HangoutIdParamsDto extends createZodDto(z.object({ id: z.string().uuid() })) {}

export class HangoutGroupIdParamsDto extends createZodDto(z.object({ id: z.string().uuid() })) {}

const activityTypeSchema = z
  .string()
  .trim()
  .min(1)
  .max(50)
  .refine((value) => placeTypesForActivity(value) !== undefined, {
    message: 'Activity type chưa được hỗ trợ',
  });

const fairnessModeSchema = z.enum(['balanced', 'fairest', 'fastest', 'weighted']);
const budgetMaxSchema = z.number().int().min(0).max(100_000_000);
const timeCapSecondsSchema = z.number().int().min(300).max(14_400);

/**
 * `activityType` is checked against the suggest pipeline's own table so a kèo
 * can never be created in a shape `/suggest` would later reject with a 422.
 * Diacritics are folded by `normalizeActivityType`, so "cà phê" is accepted.
 */
export class CreateHangoutDto extends createZodDto(
  z.object({
    activityType: activityTypeSchema,
    plannedAt: z.iso.datetime({ offset: true }),
    fairnessMode: fairnessModeSchema.default('balanced'),
    /** VND mỗi người. */
    budgetMax: budgetMaxSchema.optional(),
    timeCapSeconds: timeCapSecondsSchema.default(1_800),
    /** Client sinh UUID để tạo kèo idempotent khi retry. */
    idempotencyKey: z.string().uuid(),
  }),
) {}

export class UpdateHangoutDto extends createZodDto(
  z
    .object({
      activityType: activityTypeSchema.optional(),
      plannedAt: z.iso.datetime({ offset: true }).optional(),
      fairnessMode: fairnessModeSchema.optional(),
      /** Gửi null để bỏ giới hạn ngân sách. */
      budgetMax: budgetMaxSchema.nullable().optional(),
      timeCapSeconds: timeCapSecondsSchema.optional(),
    })
    .refine((value) => Object.keys(value).length > 0, {
      message: 'Cần ít nhất một trường để cập nhật',
    }),
) {}

export class UpsertParticipantDto extends createZodDto(
  z.object({
    lat: z.number().min(-90).max(90),
    lng: z.number().min(-180).max(180),
    /** Địa chỉ đã resolve tại đúng tọa độ xuất phát; client cũ có thể bỏ trống. */
    originAddress: z.string().trim().min(1).max(512).optional(),
    travelMode: z.enum(['two_wheeler', 'drive', 'walk', 'transit']).default('two_wheeler'),
    /** Bỏ trống thì lấy display name trong profile. */
    displayName: z.string().trim().min(1).max(100).optional(),
    weight: z.number().min(0.6).max(1.4).optional(),
    isFlexible: z.boolean().optional(),
  }),
) {}
