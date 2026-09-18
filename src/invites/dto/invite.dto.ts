import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

/** Cùng biên độ với `JoinGroupDto` — mã 8 ký tự, chừa chỗ cho dấu người dùng gõ thêm. */
export class InviteCodeParamsDto extends createZodDto(
  z.object({ code: z.string().trim().min(4).max(16) }),
) {}
