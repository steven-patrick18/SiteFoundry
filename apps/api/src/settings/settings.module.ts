import { Module } from '@nestjs/common';
import { DiscoveryModule } from '../discovery/discovery.module';
import { SettingsController } from './settings.controller';
import { UsersController } from './users.controller';

@Module({
  imports: [DiscoveryModule],
  controllers: [SettingsController, UsersController],
})
export class SettingsModule {}
