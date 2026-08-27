import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export class GroupIdParamsDto extends createZodDto(z.object({ id: z.string().uuid() })) {}

export class CreateGroupDto extends createZodDto(
  z.object({
    name: z.string().trim().min(1).max(120),
    /** Bao lâu thì link mời hết hiệu lực. Mặc định 7 ngày. */
    inviteTtlHours: z.number().int().min(1).max(720).default(168),
  }),
) {}

export class UpdateGroupDto extends createZodDto(
  z.object({
    name: z.string().trim().min(1).max(120),
  }),
) {}

export class JoinGroupDto extends createZodDto(
  z.object({ inviteCode: z.string().trim().min(4).max(16) }),
) {}

export class RotateInviteDto extends createZodDto(
  z.object({ inviteTtlHours: z.number().int().min(1).max(720).default(168) }),
) {}
