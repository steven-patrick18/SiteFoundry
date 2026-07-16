import { Module } from '@nestjs/common';
import { DiscoveryModule } from '../discovery/discovery.module';
import { SettingsController } from './settings.controller';
import { UsersController } from './users.controller';
import { UpdateController } from './update.controller';
import { UpdateService } from './update.service';

@Module({
  imports: [DiscoveryModule],
  controllers: [SettingsController, UsersController, UpdateController],
  providers: [UpdateService],
})
export class SettingsModule {}
