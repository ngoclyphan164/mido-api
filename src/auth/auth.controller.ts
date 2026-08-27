import { Controller, Delete, Get, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { CurrentUser } from '../common/decorators/current-user.decorator';
import { SupabaseAdminService } from './supabase-admin.service';
import type { AuthUser } from './auth.types';

@ApiTags('auth')
@ApiBearerAuth()
@Controller('auth')
export class AuthController {
  constructor(private readonly supabaseAdmin: SupabaseAdminService) {}

  @Get('me')
  @ApiOperation({ summary: 'Kiểm tra access token và trả identity hiện tại' })
  me(@CurrentUser() user: AuthUser) {
    return { user };
  }

  @Delete('me')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Xóa vĩnh viễn tài khoản hiện tại và dữ liệu liên quan' })
  async deleteMe(@CurrentUser() user: AuthUser): Promise<void> {
    await this.supabaseAdmin.deleteUser(user.id);
  }
}
