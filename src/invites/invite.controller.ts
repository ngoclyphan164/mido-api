import { Controller, Get, Param } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';

import { Public } from '../common/decorators/public.decorator';
import { InviteCodeParamsDto } from './dto/invite.dto';
import { InviteService } from './invite.service';

@ApiTags('invites')
@Controller('invites')
export class InviteController {
  constructor(private readonly invites: InviteService) {}

  /**
   * Route công khai duy nhất ngoài `/health`, nên response cố tình nghèo nàn:
   * tên nhóm và số thành viên là vừa đủ để màn join nói "Bạn được mời vào nhóm X",
   * còn `groupId` hay tên từng người thì không.
   *
   * Cặp 404/410 có tiết lộ mã đó có tồn tại hay không. Đó là bản chất của tính
   * năng ("cho tôi biết về mã này"), và keyspace làm nó vô nghĩa: 8 ký tự
   * Crockford-32 là ~1.1e12 tổ hợp. Mối đe doạ thật là link bị lộ, và xoay mã
   * đã xử lý việc đó.
   */
  @Get(':code')
  @Public()
  @Throttle({ default: { ttl: 60_000, limit: 20 } })
  @ApiOperation({ summary: 'Xem trước lời mời trước khi đăng nhập; không cần token' })
  preview(@Param() params: InviteCodeParamsDto) {
    return this.invites.preview(params.code);
  }
}
