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
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import type { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import {
  CreateSavedLocationDto,
  SavedLocationIdParamsDto,
  UpdateSavedLocationDto,
} from './dto/saved-location.dto';
import { SavedLocationService } from './saved-location.service';

@ApiTags('saved-locations')
@ApiBearerAuth()
@Controller('saved-locations')
export class SavedLocationController {
  constructor(private readonly savedLocations: SavedLocationService) {}

  @Get()
  @ApiOperation({ summary: 'Địa điểm đã lưu của người dùng hiện tại' })
  list(@CurrentUser() user: AuthUser) {
    return this.savedLocations.list(user.id);
  }

  @Post()
  @ApiOperation({ summary: 'Lưu một địa điểm để điền điểm xuất phát bằng một chạm' })
  create(@Body() body: CreateSavedLocationDto, @CurrentUser() user: AuthUser) {
    return this.savedLocations.create(user.id, body);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Đổi tên, toạ độ hoặc địa chỉ của một địa điểm đã lưu' })
  update(
    @Param() params: SavedLocationIdParamsDto,
    @Body() body: UpdateSavedLocationDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.savedLocations.update(params.id, user.id, body);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Xoá một địa điểm đã lưu' })
  async remove(
    @Param() params: SavedLocationIdParamsDto,
    @CurrentUser() user: AuthUser,
  ): Promise<void> {
    await this.savedLocations.remove(params.id, user.id);
  }
}
