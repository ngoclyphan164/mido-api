import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export class HangoutIdParamsDto extends createZodDto(z.object({ id: z.string().uuid() })) {}

export class SetPickDto extends createZodDto(z.object({ suggestionId: z.string().uuid() })) {}
