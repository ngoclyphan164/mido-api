import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

/**
 * `avatarUrl: null` xoá ảnh, bỏ trống thì giữ nguyên — cùng quy ước với
 * `budgetMax` trong `UpdateHangoutDto`. Bản thân URL được kiểm tra ở service:
 * tiền tố đến từ ConfigService, còn schema này dựng lúc load module.
 */
export class UpdateProfileDto extends createZodDto(
  z
    .object({
      displayName: z.string().trim().min(1).max(100).optional(),
      avatarUrl: z.string().trim().url().max(2048).nullable().optional(),
      defaultTravelMode: z.enum(['two_wheeler', 'drive', 'walk', 'transit']).optional(),
    })
    .refine((value) => Object.keys(value).length > 0, {
      message: 'Cần ít nhất một trường để cập nhật',
    }),
) {}
