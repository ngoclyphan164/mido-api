import { Body, Controller, Get, Patch } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import type { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { UpdateProfileDto } from './dto/profile.dto';
import { ProfileService } from './profile.service';

/**
 * Deliberately separate from `GET /v1/auth/me`, which is the only route in the
 * API that touches no database connection and is therefore what the client uses
 * as a cheap session probe on resume. Folding a profile read into it would put
 * a round trip on every cold start.
 */
@ApiTags('profiles')
@ApiBearerAuth()
@Controller('profiles')
export class ProfileController {
  constructor(private readonly profiles: ProfileService) {}

  @Get('me')
  @ApiOperation({ summary: 'Hồ sơ của người dùng hiện tại; tự tạo nếu chưa có' })
  me(@CurrentUser() user: AuthUser) {
    return this.profiles.me(user);
  }

  @Patch('me')
  @ApiOperation({ summary: 'Đổi tên hiển thị, ảnh đại diện, phương tiện mặc định' })
  update(@Body() body: UpdateProfileDto, @CurrentUser() user: AuthUser) {
    return this.profiles.update(user, body);
  }
}
