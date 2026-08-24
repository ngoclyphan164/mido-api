import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

const participantSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  weight: z.number().min(0.6).max(1.4).optional(),
});

export class MidpointPreviewDto extends createZodDto(
  z.object({
    participants: z.array(participantSchema).min(2).max(10),
  }),
) {}
