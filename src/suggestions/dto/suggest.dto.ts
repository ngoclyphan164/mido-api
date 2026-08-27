import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export class HangoutIdParamsDto extends createZodDto(z.object({ id: z.string().uuid() })) {}

export class SuggestDto extends createZodDto(
  z.object({
    /**
     * Trần 20 = đúng số candidate mà pipeline đã tính route (và trả tiền) cho.
     * Client xin nguyên pool một lần rồi tự xoay vòng "suggest lại" ở local,
     * thay vì gọi lại API — gọi lại chỉ tốn tiền Google mà ra y hệt kết quả cũ,
     * vì `/suggest` deterministic theo participant và `plannedAt`.
     */
    topN: z.number().int().min(1).max(20).default(5),
    minimumRating: z.number().min(0).max(5).optional(),
  }),
) {}

/** Phân trang cho `GET :id/suggestions`. Client hiện 5 option mỗi lần. */
export class StoredSuggestionsQueryDto extends createZodDto(
  z.object({
    offset: z.coerce.number().int().min(0).max(19).default(0),
    limit: z.coerce.number().int().min(1).max(20).default(5),
  }),
) {}

export class StoredSuggestionParamsDto extends createZodDto(
  z.object({ id: z.string().uuid(), suggestionId: z.string().uuid() }),
) {}
