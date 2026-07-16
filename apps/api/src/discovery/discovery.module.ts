import { Module } from '@nestjs/common';
import { DiscoveryController } from './discovery.controller';
import { PublicSearchController } from './public-search.controller';
import { DiscoveryService } from './discovery.service';

@Module({
  controllers: [DiscoveryController, PublicSearchController],
  providers: [DiscoveryService],
  exports: [DiscoveryService],
})
export class DiscoveryModule {}
