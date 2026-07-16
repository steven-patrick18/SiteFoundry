import { Controller, ForbiddenException, Get, Query } from '@nestjs/common';
import { AuthUser, CurrentUser } from '../auth/current-user.decorator';
import { DiscoveryService } from './discovery.service';

@Controller('discovery')
export class DiscoveryController {
  constructor(private readonly discovery: DiscoveryService) {}

  /** Panel-side product finder (SerpApi proxied server-side; key never
   * reaches the browser). Cached results are free; fresh queries spend one
   * API credit. */
  @Get('products')
  search(
    @CurrentUser() user: AuthUser,
    @Query('q') q = '',
    @Query('gl') gl = 'us',
  ) {
    if (user.role === 'viewer') {
      throw new ForbiddenException('Viewers cannot run product discovery');
    }
    return this.discovery.search(q, /^[a-z]{2}$/.test(gl) ? gl : 'us');
  }

  @Get('status')
  async status(@CurrentUser() _user: AuthUser) {
    return { enabled: await this.discovery.isEnabled() };
  }
}
