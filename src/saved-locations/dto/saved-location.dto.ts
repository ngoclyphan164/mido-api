import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export class SavedLocationIdParamsDto extends createZodDto(z.object({ id: z.string().uuid() })) {}

export class CreateSavedLocationDto extends createZodDto(
  z.object({
    label: z.string().trim().min(1).max(80),
    lat: z.number().min(-90).max(90),
    lng: z.number().min(-180).max(180),
    /** Địa chỉ đã resolve tại đúng toạ độ này; điền thẳng vào participant sau đó. */
    address: z.string().trim().min(1).max(512).optional(),
  }),
) {}

export class UpdateSavedLocationDto extends createZodDto(
  z
    .object({
      label: z.string().trim().min(1).max(80).optional(),
      lat: z.number().min(-90).max(90).optional(),
      lng: z.number().min(-180).max(180).optional(),
      /** `null` xoá địa chỉ; bỏ trống thì giữ nguyên. */
      address: z.string().trim().min(1).max(512).nullable().optional(),
    })
    .refine((value) => Object.keys(value).length > 0, {
      message: 'Provide at least one field to update',
    })
    // Một nửa toạ độ thì không di chuyển được điểm nào cả.
    .refine((value) => (value.lat === undefined) === (value.lng === undefined), {
      message: 'lat and lng must be sent together',
    }),
) {}
