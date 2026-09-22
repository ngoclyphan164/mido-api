import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export class SuggestionIdParamsDto extends createZodDto(z.object({ id: z.string().uuid() })) {}

export class CastVoteDto extends createZodDto(
  z.object({ value: z.enum(['up', 'down', 'veto']) }),
) {}
