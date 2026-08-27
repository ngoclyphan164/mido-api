import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

const searchLocationQuerySchema = z
  .object({
    q: z.string().trim().min(2).max(200),
    lat: z.coerce.number().min(-90).max(90).optional(),
    lng: z.coerce.number().min(-180).max(180).optional(),
    radiusMeters: z.coerce.number().int().min(1).max(50_000).optional(),
    limit: z.coerce.number().int().min(1).max(10).default(5),
  })
  .superRefine((query, context) => {
    const hasLat = query.lat !== undefined;
    const hasLng = query.lng !== undefined;

    if (hasLat !== hasLng) {
      context.addIssue({
        code: 'custom',
        path: hasLat ? ['lng'] : ['lat'],
        message: 'lat và lng phải được gửi cùng nhau',
      });
    }

    if (query.radiusMeters !== undefined && (!hasLat || !hasLng)) {
      context.addIssue({
        code: 'custom',
        path: ['radiusMeters'],
        message: 'radiusMeters chỉ dùng được khi có lat và lng',
      });
    }
  });

export class SearchLocationQueryDto extends createZodDto(searchLocationQuerySchema) {}
