import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';

export type SslAlertLevel = 'expired' | 'renewal_failed' | 'critical' | 'warning' | 'notice';

export interface SslAlert {
  site_id: string;
  name: string;
  domain: string;
  ssl_status: string;
  ssl_expires_at: string | null;
  days_left: number | null;
  level: SslAlertLevel;
}

/** §9: alert at 14 / 7 / 1 days before expiry; flag expired certs. Pure. */
export function classifySsl(input: {
  sslStatus: string;
  sslExpiresAt: Date | null;
  now?: Date;
}): { level: SslAlertLevel; daysLeft: number | null } | null {
  if (input.sslStatus === 'renewal_failed') return { level: 'renewal_failed', daysLeft: null };
  if (!input.sslExpiresAt || input.sslStatus === 'none') return null;
  const now = input.now ?? new Date();
  const daysLeft = Math.floor((input.sslExpiresAt.getTime() - now.getTime()) / 86_400_000);
  if (daysLeft < 0) return { level: 'expired', daysLeft };
  if (daysLeft <= 1) return { level: 'critical', daysLeft };
  if (daysLeft <= 7) return { level: 'warning', daysLeft };
  if (daysLeft <= 14) return { level: 'notice', daysLeft };
  return null;
}

@Injectable()
export class SslMonitorService {
  private readonly logger = new Logger(SslMonitorService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** Daily sweep (§9): mark expired certs and log approaching expiries. */
  @Cron(CronExpression.EVERY_DAY_AT_6AM)
  async sweep(): Promise<void> {
    try {
      const flipped = await this.prisma.admin.site.updateMany({
        where: { sslStatus: 'active', sslExpiresAt: { lt: new Date() } },
        data: { sslStatus: 'expired' },
      });
      if (flipped.count > 0) {
        this.logger.warn(`${flipped.count} site cert(s) marked expired`);
      }
      const alerts = await this.collectAll();
      for (const alert of alerts) {
        this.logger.warn(
          `SSL ${alert.level}: ${alert.domain} (${alert.days_left ?? '?'} days left)`,
        );
      }
    } catch (err: any) {
      this.logger.error(`SSL sweep failed: ${err?.message ?? err}`);
    }
  }

  /** Tenant-scoped alerts for the dashboard banner. */
  async alertsFor(tenantId: string): Promise<SslAlert[]> {
    const sites = await this.prisma.withTenant(tenantId, (tx) =>
      tx.site.findMany({
        where: { status: { in: ['published', 'paused'] } },
        select: {
          id: true, name: true, domain: true,
          sslStatus: true, sslExpiresAt: true,
        },
      }),
    );
    return this.classifyMany(sites);
  }

  private async collectAll(): Promise<SslAlert[]> {
    const sites = await this.prisma.admin.site.findMany({
      where: { status: { in: ['published', 'paused'] } },
      select: { id: true, name: true, domain: true, sslStatus: true, sslExpiresAt: true },
    });
    return this.classifyMany(sites);
  }

  private classifyMany(
    sites: Array<{ id: string; name: string; domain: string; sslStatus: string; sslExpiresAt: Date | null }>,
  ): SslAlert[] {
    const alerts: SslAlert[] = [];
    for (const site of sites) {
      const result = classifySsl(site);
      if (!result) continue;
      alerts.push({
        site_id: site.id, name: site.name, domain: site.domain,
        ssl_status: site.sslStatus,
        ssl_expires_at: site.sslExpiresAt?.toISOString() ?? null,
        days_left: result.daysLeft,
        level: result.level,
      });
    }
    const order: SslAlertLevel[] = ['expired', 'renewal_failed', 'critical', 'warning', 'notice'];
    return alerts.sort((a, b) => order.indexOf(a.level) - order.indexOf(b.level));
  }
}
