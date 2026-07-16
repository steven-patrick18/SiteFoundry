import { Module } from '@nestjs/common';
import { SslController } from './ssl.controller';
import { SslMonitorService } from './ssl-monitor.service';

@Module({
  controllers: [SslController],
  providers: [SslMonitorService],
  exports: [SslMonitorService],
})
export class SslModule {}
