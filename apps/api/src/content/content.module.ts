import { Module } from '@nestjs/common';
import { InstallerModule } from '../installer/installer.module';
import { ContentController } from './content.controller';
import { ContentService } from './content.service';

@Module({
  imports: [InstallerModule],
  controllers: [ContentController],
  providers: [ContentService],
  exports: [ContentService],
})
export class ContentModule {}
