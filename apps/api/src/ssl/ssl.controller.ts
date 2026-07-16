import { Controller, Get } from '@nestjs/common';
import { AuthUser, CurrentUser } from '../auth/current-user.decorator';
import { SslMonitorService } from './ssl-monitor.service';

@Controller('alerts')
export class SslController {
  constructor(private readonly monitor: SslMonitorService) {}

  /** SSL expiry / renewal alerts for the dashboard banner (§9). */
  @Get('ssl')
  alerts(@CurrentUser() user: AuthUser) {
    return this.monitor.alertsFor(user.tenantId);
  }
}
