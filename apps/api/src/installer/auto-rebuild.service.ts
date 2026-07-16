import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { InstallerService } from './installer.service';

/**
 * Nightly auto-rebuild. The catalog (product/category pages) is generated from
 * the accumulated visitor-search cache at build time — so a live site's set of
 * pages only grows when it's rebuilt. This sweep rebuilds every live site whose
 * catalog has grown since its last build, turning newly-searched products into
 * permanent /product/ and /category/ pages without any manual work.
 *
 * Files-only (InstallerService.rebuildFiles) — no nginx/SSL touched. Disable
 * with AUTO_REBUILD_ENABLED=false.
 */
@Injectable()
export class AutoRebuildService {
  private readonly logger = new Logger(AutoRebuildService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly installer: InstallerService,
    private readonly config: ConfigService,
  ) {}

  enabled(): boolean {
    return String(this.config.get('AUTO_REBUILD_ENABLED', 'true')) !== 'false';
  }

  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async nightly(): Promise<void> {
    // The worker process also loads this module; run the sweep only once,
    // in the API process (see worker.ts SF_WORKER marker).
    if (process.env.SF_WORKER === '1') return;
    if (!this.enabled()) return;
    try {
      await this.sweep();
    } catch (err: any) {
      this.logger.error(`auto-rebuild sweep crashed: ${err?.message ?? err}`);
    }
  }

  /**
   * Rebuild live sites whose catalog changed since their last successful build.
   * Sequential + best-effort: one site's failure never blocks the others, and
   * sites already building are skipped.
   */
  async sweep(): Promise<{ considered: number; rebuilt: number }> {
    // The catalog is drawn from the whole panel's search cache; its newest row
    // tells us whether anything new has been searched since a site last built.
    const newest = await this.prisma.admin.searchCache.findFirst({
      orderBy: { fetchedAt: 'desc' },
      select: { fetchedAt: true },
    });
    if (!newest) {
      this.logger.log('auto-rebuild: no catalog yet — nothing to do');
      return { considered: 0, rebuilt: 0 };
    }

    const sites = await this.prisma.admin.site.findMany({
      where: { installStatus: 'live' },
      select: { id: true, tenantId: true, domain: true },
    });

    let rebuilt = 0;
    for (const site of sites) {
      if (this.installer.isRunning(site.id)) continue;
      const lastBuild = await this.prisma.admin.build.findFirst({
        where: { siteId: site.id, status: 'success' },
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true },
      });
      // Skip if no product has been searched since this site last built.
      if (lastBuild && newest.fetchedAt <= lastBuild.createdAt) continue;
      try {
        this.logger.log(`auto-rebuild ${site.domain}: catalog changed, rebuilding`);
        await this.installer.rebuildFiles(site.tenantId, site.id);
        rebuilt++;
      } catch (err: any) {
        this.logger.error(`auto-rebuild ${site.domain} failed: ${err?.message ?? err}`);
      }
    }
    this.logger.log(`auto-rebuild sweep complete: ${rebuilt}/${sites.length} site(s) rebuilt`);
    return { considered: sites.length, rebuilt };
  }
}
