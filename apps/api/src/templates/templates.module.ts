import { Module } from '@nestjs/common';
import { StorageService } from '../storage/storage.service';
import { TemplatesController } from './templates.controller';
import { TemplatesService } from './templates.service';

@Module({
  controllers: [TemplatesController],
  providers: [TemplatesService, StorageService],
  exports: [TemplatesService],
})
export class TemplatesModule {}
