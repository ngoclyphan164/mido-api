import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Put,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import type { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import {
  CreateHangoutDto,
  HangoutGroupIdParamsDto,
  HangoutIdParamsDto,
  UpdateHangoutDto,
  UpsertParticipantDto,
} from './dto/hangout.dto';
import { HangoutService } from './hangout.service';

@ApiTags('hangouts')
@ApiBearerAuth()
@Controller()
export class HangoutController {
  constructor(private readonly hangouts: HangoutService) {}

  @Post('groups/:id/hangouts')
  @ApiOperation({ summary: 'Tạo kèo trong nhóm; idempotent theo idempotencyKey' })
  create(
    @Param() params: HangoutGroupIdParamsDto,
    @Body() body: CreateHangoutDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.hangouts.create(params.id, user.id, {
      activityType: body.activityType,
      plannedAt: new Date(body.plannedAt),
      fairnessMode: body.fairnessMode,
      budgetMax: body.budgetMax,
      timeCapSeconds: body.timeCapSeconds,
      idempotencyKey: body.idempotencyKey,
    });
  }

  @Get('groups/:id/hangouts')
  @ApiOperation({ summary: 'Danh sách kèo của nhóm, mới nhất trước' })
  listForGroup(@Param() params: HangoutGroupIdParamsDto, @CurrentUser() user: AuthUser) {
    return this.hangouts.listForGroup(params.id, user.id);
  }

  @Get('hangouts/:id')
  @ApiOperation({
    summary: 'Chi tiết kèo: participant đã nhập vị trí, thành viên còn thiếu, và outing đã chốt',
  })
  detail(@Param() params: HangoutIdParamsDto, @CurrentUser() user: AuthUser) {
    return this.hangouts.detail(params.id, user.id);
  }

  @Patch('hangouts/:id')
  @ApiOperation({ summary: 'Sửa kèo đang draft/voting; creator hoặc owner/admin' })
  update(
    @Param() params: HangoutIdParamsDto,
    @Body() body: UpdateHangoutDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.hangouts.update(params.id, user.id, {
      activityType: body.activityType,
      plannedAt: body.plannedAt === undefined ? undefined : new Date(body.plannedAt),
      fairnessMode: body.fairnessMode,
      budgetMax: body.budgetMax,
      timeCapSeconds: body.timeCapSeconds,
    });
  }

  @Delete('hangouts/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Xóa kèo chưa chốt; creator hoặc owner/admin' })
  async remove(@Param() params: HangoutIdParamsDto, @CurrentUser() user: AuthUser): Promise<void> {
    await this.hangouts.remove(params.id, user.id);
  }

  @Put('hangouts/:id/participants/me')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Nhập hoặc cập nhật vị trí xuất phát và phương tiện của chính mình' })
  upsertOwnParticipant(
    @Param() params: HangoutIdParamsDto,
    @Body() body: UpsertParticipantDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.hangouts.upsertOwnParticipant(params.id, user.id, body);
  }
}
