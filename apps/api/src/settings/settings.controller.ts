import { Controller, ForbiddenException, Get } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthUser, CurrentUser } from '../auth/current-user.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { DiscoveryService } from '../discovery/discovery.service';

/** §12 Settings: system + integrations overview. Never exposes secrets —
 * only which integrations are configured and non-sensitive mode flags. */
@Controller('settings')
export class SettingsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly discovery: DiscoveryService,
  ) {}

  @Get('system')
  async system(@CurrentUser() user: AuthUser) {
    if (user.role !== 'admin') {
      throw new ForbiddenException('Only admins can view system settings');
    }
    const [tenant, counts] = await Promise.all([
      this.prisma.withTenant(user.tenantId, (tx) =>
        tx.tenant.findFirst({ select: { name: true, plan: true, createdAt: true } }),
      ),
      this.prisma.withTenant(user.tenantId, async (tx) => ({
        users: await tx.user.count(),
        servers: await tx.server.count(),
        clients: await tx.client.count(),
        sites: await tx.site.count(),
        leads: await tx.lead.count(),
      })),
    ]);

    return {
      tenant,
      counts,
      system: {
        kms_provider: this.config.get<string>('KMS_PROVIDER'),
        jobs_mode: this.config.get<string>('JOBS_MODE') ?? 'inline',
        skip_ssl: this.config.get<string>('SKIP_SSL') === 'true',
        panel_public_url:
          this.config.get<string>('PANEL_PUBLIC_URL') ?? 'http://localhost:3000',
        node_env: this.config.get<string>('NODE_ENV'),
      },
      integrations: {
        serpapi: {
          configured: this.discovery.enabled,
          searches_this_month: this.discovery.enabled
            ? await this.discovery.usageThisMonth()
            : 0,
        },
        pushvault: {
          configured: false,
          note: 'Sibling product — property keys are set per site; subscriber backend ships with PushVault',
        },
        callforge: { configured: false, note: 'Phase 2 sibling product' },
        google_ads_api: { configured: false, note: 'Phase 2 — OAuth spend sync' },
      },
    };
  }
}
