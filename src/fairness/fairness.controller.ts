import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import type { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import {
  CompleteHangoutDto,
  DecideHangoutDto,
  FairnessResourceIdParamsDto,
} from './dto/fairness.dto';
import { FairnessService } from './fairness.service';

@ApiTags('fairness')
@ApiBearerAuth()
@Controller()
export class FairnessController {
  constructor(private readonly fairness: FairnessService) {}

  @Post('hangouts/:id/decide')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Owner/admin chốt một active suggestion cho kèo' })
  decide(
    @Param() params: FairnessResourceIdParamsDto,
    @Body() body: DecideHangoutDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.fairness.decide(params.id, user.id, body.suggestionId);
  }

  @Post('hangouts/:id/complete')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Xác nhận thời gian thực tế và ghi fairness ledger' })
  complete(
    @Param() params: FairnessResourceIdParamsDto,
    @Body() body: CompleteHangoutDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.fairness.complete(params.id, user.id, body);
  }

  @Get('groups/:id/fairness')
  @ApiOperation({ summary: 'Đọc fairness debt hiện tại của các thành viên trong nhóm' })
  getGroupFairness(@Param() params: FairnessResourceIdParamsDto, @CurrentUser() user: AuthUser) {
    return this.fairness.getGroupFairness(params.id, user.id);
  }
}
