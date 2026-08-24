import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import type { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { CreateGroupDto, GroupIdParamsDto, JoinGroupDto, RotateInviteDto } from './dto/group.dto';
import { GroupService } from './group.service';

@ApiTags('groups')
@ApiBearerAuth()
@Controller('groups')
export class GroupController {
  constructor(private readonly groups: GroupService) {}

  @Post()
  @ApiOperation({
    summary: 'Tạo nhóm mới; người tạo thành owner. Trả invite code một lần duy nhất',
  })
  create(@Body() body: CreateGroupDto, @CurrentUser() user: AuthUser) {
    return this.groups.create(user.id, body.name, body.inviteTtlHours);
  }

  @Get()
  @ApiOperation({ summary: 'Danh sách nhóm mà người dùng đang là thành viên' })
  list(@CurrentUser() user: AuthUser) {
    return this.groups.list(user.id);
  }

  // Khai báo trước ':id' để 'join' không bị match thành UUID param.
  @Post('join')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Vào nhóm bằng mã mời; idempotent nếu đã là thành viên' })
  join(@Body() body: JoinGroupDto, @CurrentUser() user: AuthUser) {
    return this.groups.join(user.id, body.inviteCode);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Chi tiết nhóm kèm danh sách thành viên' })
  detail(@Param() params: GroupIdParamsDto, @CurrentUser() user: AuthUser) {
    return this.groups.detail(params.id, user.id);
  }

  @Post(':id/invite')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Owner/admin tạo invite code mới. DB chỉ giữ hash nên code cũ không đọc lại được',
  })
  rotateInvite(
    @Param() params: GroupIdParamsDto,
    @Body() body: RotateInviteDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.groups.rotateInvite(params.id, user.id, body.inviteTtlHours);
  }
}
