import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';

import { SearchLocationQueryDto } from './dto/search-location.dto';
import { PlaceSearchService } from './place-search.service';

@ApiTags('places')
@ApiBearerAuth()
@Controller('places')
export class PlaceSearchController {
  constructor(private readonly placeSearch: PlaceSearchService) {}

  @Get('search')
  @Throttle({ default: { ttl: 60_000, limit: 30 } })
  @ApiOperation({ summary: 'Tìm địa điểm theo tên hoặc địa chỉ để chọn vị trí xuất phát' })
  search(@Query() query: SearchLocationQueryDto) {
    return this.placeSearch.search(query);
  }
}
