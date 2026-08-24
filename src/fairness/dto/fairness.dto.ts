import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

const uuidParamsSchema = z.object({ id: z.string().uuid() });

export class FairnessResourceIdParamsDto extends createZodDto(uuidParamsSchema) {}

export class DecideHangoutDto extends createZodDto(z.object({ suggestionId: z.string().uuid() })) {}

export class CompleteHangoutDto extends createZodDto(
  z.object({
    happenedAt: z.iso.datetime({ offset: true }).optional(),
    actualTravelTimes: z
      .array(
        z.object({
          participantId: z.string().uuid(),
          durationSec: z.number().int().min(0).max(86_400),
        }),
      )
      .min(2)
      .max(10)
      .superRefine((travelTimes, context) => {
        const seen = new Set<string>();
        travelTimes.forEach((travelTime, index) => {
          if (seen.has(travelTime.participantId)) {
            context.addIssue({
              code: 'custom',
              message: 'participantId không được trùng',
              path: [index, 'participantId'],
            });
          }
          seen.add(travelTime.participantId);
        });
      }),
  }),
) {}
