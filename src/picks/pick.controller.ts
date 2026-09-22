import { Body, Controller, Delete, HttpCode, HttpStatus, Param, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import type { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { HangoutIdParamsDto, SetPickDto } from './dto/set-pick.dto';
import { PickService } from './pick.service';

/**
 * Lựa chọn của người gọi là một singleton của mỗi kèo, nên nó là một resource
 * đơn: `PUT` để đặt, `DELETE` để bỏ. Hình dạng URL nói đúng luật — không có
 * chỗ nào để tồn tại lựa chọn thứ hai.
 */
@ApiTags('picks')
@ApiBearerAuth()
@Controller('hangouts')
export class PickController {
  constructor(private readonly picks: PickService) {}

  @Put(':id/pick')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Tick chọn một quán cho kèo này, thay cho lựa chọn trước' })
  setPick(
    @Param() params: HangoutIdParamsDto,
    @Body() body: SetPickDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.picks.setPick(params.id, user.id, body.suggestionId);
  }

  @Delete(':id/pick')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Bỏ tick của chính mình ở kèo này' })
  async clearPick(
    @Param() params: HangoutIdParamsDto,
    @CurrentUser() user: AuthUser,
  ): Promise<void> {
    await this.picks.clearPick(params.id, user.id);
  }
}
