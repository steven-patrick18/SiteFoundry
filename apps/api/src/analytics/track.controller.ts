import {
  BadRequestException,
  Controller,
  ForbiddenException,
  HttpCode,
  Post,
  Req,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import { Public } from '../auth/public.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { AnalyticsService } from './analytics.service';

const EVENTS = new Set([
  'pageview', 'cta_click', 'outbound_click',
  'push_prompt_shown', 'push_subscribed', 'lead_submit',
]);

/** Sliding-window limiter: 60 events/min per session (§13). In-memory per
 * process — swap for Redis in multi-instance deployments. */
class SessionRateLimiter {
  private buckets = new Map<string, number[]>();

  allow(key: string, limit = 60, windowMs = 60_000): boolean {
    const now = Date.now();
    const hits = (this.buckets.get(key) ?? []).filter((t) => now - t < windowMs);
    if (hits.length >= limit) {
      this.buckets.set(key, hits);
      return false;
    }
    hits.push(now);
    this.buckets.set(key, hits);
    if (this.buckets.size > 10_000) this.buckets.clear(); // crude memory cap
    return true;
  }
}

@Controller('public')
export class TrackController {
  private readonly limiter = new SessionRateLimiter();

  constructor(
    private readonly prisma: PrismaService,
    private readonly analytics: AnalyticsService,
    private readonly config: ConfigService,
  ) {}

  /**
   * §10 POST /public/track — no auth; Origin validated against the site's
   * domain. Body arrives as text/plain (sendBeacon simple request, no CORS
   * preflight) and is parsed manually.
   */
  @Public()
  @Post('track')
  @HttpCode(204)
  async track(@Req() req: Request): Promise<void> {
    const body = this.parseBody(req);
    const siteKey = String(body.site_key ?? '');
    const event = String(body.event ?? '');
    if (!siteKey || !EVENTS.has(event)) {
      throw new BadRequestException('site_key and a valid event are required');
    }

    const sessionId = typeof body.session_id === 'string' ? body.session_id.slice(0, 64) : undefined;
    if (!this.limiter.allow(sessionId || req.ip || 'anon')) {
      return; // silently drop over-limit beacons (§13: 60/min/session)
    }

    const site = await this.prisma.admin.site.findUnique({
      where: { id: siteKey },
      select: { id: true, tenantId: true, domain: true, extraDomains: true, status: true },
    });
    if (!site || site.status === 'archived') return; // don't leak site existence

    // Origin must match the site's domain (enforced outside development)
    const origin = req.headers.origin;
    const enforce = this.config.get<string>('NODE_ENV') === 'production';
    if (origin && enforce) {
      let host: string;
      try {
        host = new URL(origin).hostname.toLowerCase();
      } catch {
        throw new ForbiddenException('Bad origin');
      }
      const allowed = new Set([site.domain, ...site.extraDomains].map((d) => d.toLowerCase()));
      if (!allowed.has(host)) throw new ForbiddenException('Origin not allowed for this site');
    }

    const ua = String(req.headers['user-agent'] ?? '');
    await this.analytics.recordVisit({
      tenantId: site.tenantId,
      siteId: site.id,
      event,
      sessionId,
      utm: {
        source: this.str(body.utm_source),
        medium: this.str(body.utm_medium),
        campaign: this.str(body.utm_campaign),
        content: this.str(body.utm_content),
        term: this.str(body.utm_term),
      },
      referrer: this.str(body.referrer, 500),
      path: this.str(body.path, 300),
      device: /mobile|android|iphone/i.test(ua) ? 'mobile' : /ipad|tablet/i.test(ua) ? 'tablet' : 'desktop',
      browser: /edg\//i.test(ua) ? 'edge' : /chrome/i.test(ua) ? 'chrome' : /safari/i.test(ua) ? 'safari' : /firefox/i.test(ua) ? 'firefox' : 'other',
      meta: typeof body.meta === 'object' ? body.meta : undefined,
    });
  }

  private parseBody(req: Request): Record<string, unknown> {
    const raw = req.body;
    if (typeof raw === 'string') {
      try {
        return JSON.parse(raw);
      } catch {
        throw new BadRequestException('Body must be JSON');
      }
    }
    if (raw && typeof raw === 'object') return raw as Record<string, unknown>;
    throw new BadRequestException('Empty body');
  }

  private str(v: unknown, max = 200): string | undefined {
    return typeof v === 'string' && v ? v.slice(0, max) : undefined;
  }
}
