import { BadRequestException, Body, Controller, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { MidpointPreviewDto } from './dto/midpoint-preview.dto';
import { computeMidpointPreview } from './preview';

@ApiTags('midpoint')
@ApiBearerAuth()
@Controller('midpoint')
export class MidpointController {
  @Post('preview')
  @ApiOperation({ summary: 'Tính geometric median thuần, không gọi Places/Routes API' })
  preview(@Body() body: MidpointPreviewDto) {
    try {
      return computeMidpointPreview(body.participants);
    } catch (error) {
      if (error instanceof RangeError) throw new BadRequestException(error.message);
      throw error;
    }
  }
}
