import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface StatsQuery {
  from?: string;
  to?: string;
  utm_campaign?: string;
  event?: string;
  granularity?: 'day' | 'hour';
}

const FUNNEL_ORDER = [
  'pageview',
  'cta_click',
  'outbound_click',
  'push_subscribed',
  'lead_submit',
] as const;

@Injectable()
export class AnalyticsService implements OnModuleInit {
  private readonly logger = new Logger(AnalyticsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** Keep current + next month partitions present (§3: partition by month). */
  async onModuleInit() {
    try {
      await this.prisma.admin.$executeRaw`SELECT ensure_visits_partition(date_trunc('month', now())::date)`;
      await this.prisma.admin.$executeRaw`SELECT ensure_visits_partition((date_trunc('month', now()) + interval '1 month')::date)`;
    } catch (err: any) {
      this.logger.warn(`visits partition maintenance skipped: ${err?.message}`);
    }
  }

  /** Server-side write from /public/track — tenant derived from the site row. */
  async recordVisit(input: {
    tenantId: string;
    siteId: string;
    event: string;
    sessionId?: string;
    utm?: Partial<Record<'source' | 'medium' | 'campaign' | 'content' | 'term', string>>;
    referrer?: string;
    path?: string;
    device?: string;
    browser?: string;
    meta?: unknown;
  }): Promise<void> {
    await this.prisma.admin.visit.create({
      data: {
        tenantId: input.tenantId,
        siteId: input.siteId,
        event: input.event,
        sessionId: input.sessionId ?? null,
        utmSource: input.utm?.source ?? null,
        utmMedium: input.utm?.medium ?? null,
        utmCampaign: input.utm?.campaign ?? null,
        utmContent: input.utm?.content ?? null,
        utmTerm: input.utm?.term ?? null,
        referrer: input.referrer ?? null,
        path: input.path ?? null,
        device: input.device ?? null,
        browser: input.browser ?? null,
        meta: (input.meta as any) ?? undefined,
      },
    });
  }

  /** §10 GET /sites/:id/stats — visits by bucket + campaign breakdown. */
  async stats(tenantId: string, siteId: string, q: StatsQuery) {
    const { fromTs, toTs } = this.range(q);
    const bucket = q.granularity === 'hour' ? 'hour' : 'day';

    return this.prisma.withTenant(tenantId, async (tx) => {
      const campaignFilter = q.utm_campaign
        ? Prisma.sql`AND utm_campaign = ${q.utm_campaign}`
        : Prisma.empty;
      const eventFilter = q.event ? Prisma.sql`AND event = ${q.event}` : Prisma.empty;

      const byBucket = await tx.$queryRaw<
        Array<{ bucket: Date; event: string; count: bigint }>
      >(Prisma.sql`
        SELECT date_trunc(${bucket}, ts) AS bucket, event, count(*) AS count
        FROM visits
        WHERE site_id = ${siteId}::uuid AND ts >= ${fromTs} AND ts < ${toTs}
          ${campaignFilter} ${eventFilter}
        GROUP BY 1, 2 ORDER BY 1
      `);

      const topCampaigns = await tx.$queryRaw<
        Array<{ utm_campaign: string | null; visits: bigint; outbound: bigint }>
      >(Prisma.sql`
        SELECT utm_campaign,
               count(*) FILTER (WHERE event = 'pageview')       AS visits,
               count(*) FILTER (WHERE event = 'outbound_click') AS outbound
        FROM visits
        WHERE site_id = ${siteId}::uuid AND ts >= ${fromTs} AND ts < ${toTs}
        GROUP BY utm_campaign ORDER BY visits DESC LIMIT 20
      `);

      const devices = await tx.$queryRaw<
        Array<{ device: string | null; count: bigint }>
      >(Prisma.sql`
        SELECT device, count(*) AS count FROM visits
        WHERE site_id = ${siteId}::uuid AND ts >= ${fromTs} AND ts < ${toTs}
          AND event = 'pageview'
        GROUP BY device ORDER BY count DESC
      `);

      return {
        from: fromTs, to: toTs, granularity: bucket,
        series: byBucket.map((r) => ({
          bucket: r.bucket, event: r.event, count: Number(r.count),
        })),
        top_campaigns: topCampaigns.map((r) => ({
          utm_campaign: r.utm_campaign, visits: Number(r.visits), outbound: Number(r.outbound),
        })),
        devices: devices.map((r) => ({ device: r.device ?? 'unknown', count: Number(r.count) })),
      };
    });
  }

  /** §10 GET /sites/:id/funnel — §7.8 funnel with optional campaign filter. */
  async funnel(tenantId: string, siteId: string, q: StatsQuery) {
    const { fromTs, toTs } = this.range(q);
    return this.prisma.withTenant(tenantId, async (tx) => {
      const campaignFilter = q.utm_campaign
        ? Prisma.sql`AND utm_campaign = ${q.utm_campaign}`
        : Prisma.empty;
      const rows = await tx.$queryRaw<Array<{ event: string; count: bigint; sessions: bigint }>>(
        Prisma.sql`
          SELECT event, count(*) AS count, count(DISTINCT session_id) AS sessions
          FROM visits
          WHERE site_id = ${siteId}::uuid AND ts >= ${fromTs} AND ts < ${toTs}
            ${campaignFilter}
          GROUP BY event
        `,
      );
      const byEvent = new Map(rows.map((r) => [r.event, r]));
      return {
        from: fromTs, to: toTs, utm_campaign: q.utm_campaign ?? null,
        steps: FUNNEL_ORDER.map((event) => ({
          event,
          count: Number(byEvent.get(event)?.count ?? 0),
          sessions: Number(byEvent.get(event)?.sessions ?? 0),
        })),
      };
    });
  }

  private range(q: StatsQuery): { fromTs: Date; toTs: Date } {
    const toTs = q.to ? new Date(q.to) : new Date();
    const fromTs = q.from
      ? new Date(q.from)
      : new Date(toTs.getTime() - 30 * 24 * 3600 * 1000);
    return { fromTs, toTs };
  }
}
