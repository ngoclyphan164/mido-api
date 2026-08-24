import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export class HangoutIdParamsDto extends createZodDto(z.object({ id: z.string().uuid() })) {}

export class SuggestDto extends createZodDto(
  z.object({
    topN: z.number().int().min(1).max(10).default(5),
    minimumRating: z.number().min(0).max(5).optional(),
  }),
) {}
