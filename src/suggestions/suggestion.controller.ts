import { Body, Controller, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import type { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { HangoutIdParamsDto, SuggestDto } from './dto/suggest.dto';
import { SuggestionService } from './suggestion.service';

@ApiTags('suggestions')
@ApiBearerAuth()
@Controller('hangouts')
export class SuggestionController {
  constructor(private readonly suggestions: SuggestionService) {}

  @Post(':id/suggest')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Tính top địa điểm và thời gian di chuyển của từng participant' })
  suggest(
    @Param() params: HangoutIdParamsDto,
    @Body() body: SuggestDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.suggestions.suggest(params.id, user.id, body);
  }
}
