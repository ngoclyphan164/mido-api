import { Body, Controller, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import type { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { CastVoteDto, SuggestionIdParamsDto } from './dto/cast-vote.dto';
import { VoteService } from './vote.service';

@ApiTags('votes')
@ApiBearerAuth()
@Controller('suggestions')
export class VoteController {
  constructor(private readonly votes: VoteService) {}

  @Post(':id/votes')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Tạo hoặc đổi vote của participant cho một suggestion' })
  castVote(
    @Param() params: SuggestionIdParamsDto,
    @Body() body: CastVoteDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.votes.castVote(params.id, user.id, body.value);
  }
}
