import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import type { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import {
  HangoutIdParamsDto,
  StoredSuggestionParamsDto,
  StoredSuggestionsQueryDto,
  SuggestDto,
} from './dto/suggest.dto';
import { SuggestionSnapshotService } from './suggestion-snapshot.service';
import { SuggestionService } from './suggestion.service';

@ApiTags('suggestions')
@ApiBearerAuth()
@Controller('hangouts')
export class SuggestionController {
  constructor(
    private readonly suggestions: SuggestionService,
    private readonly snapshots: SuggestionSnapshotService,
  ) {}

  /**
   * Đọc lại gợi ý đã lưu — không chạm tới Places/Routes, nên "tìm lại lựa chọn
   * khác" chỉ là xin trang kế tiếp. Client phải gọi cái này trước; chỉ khi
   * `total` bằng 0 mới được `POST :id/suggest`, vì đó mới là request tính tiền.
   */
  @Get(':id/suggestions')
  @ApiOperation({ summary: 'Một trang gợi ý đã lưu, kèm tally vote và tổng số option' })
  listSuggestions(
    @Param() params: HangoutIdParamsDto,
    @Query() query: StoredSuggestionsQueryDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.snapshots.listForMember(params.id, user.id, query.offset, query.limit);
  }

  /** Một option cụ thể — màn chi tiết không phải đoán nó nằm ở trang nào. */
  @Get(':id/suggestions/:suggestionId')
  @ApiOperation({ summary: 'Một gợi ý đã lưu, kèm tally vote' })
  getSuggestion(@Param() params: StoredSuggestionParamsDto, @CurrentUser() user: AuthUser) {
    return this.snapshots.getForMember(params.id, params.suggestionId, user.id);
  }

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
