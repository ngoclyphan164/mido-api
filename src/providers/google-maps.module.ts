import { Module } from '@nestjs/common';

import { GoogleMapsClient } from './google-maps.client';

@Module({ providers: [GoogleMapsClient], exports: [GoogleMapsClient] })
export class GoogleMapsModule {}
