import { Controller, Get, Query, Req } from '@nestjs/common';
import { Request } from 'express';
import { Public } from '../auth/public.decorator';
import { DiscoveryService } from './discovery.service';

/** Sliding-window limiter: N searches/min per IP (protects the API budget). */
class IpRateLimiter {
  private buckets = new Map<string, number[]>();
  allow(key: string, limit = 15, windowMs = 60_000): boolean {
    const now = Date.now();
    const hits = (this.buckets.get(key) ?? []).filter((t) => now - t < windowMs);
    if (hits.length >= limit) {
      this.buckets.set(key, hits);
      return false;
    }
    hits.push(now);
    this.buckets.set(key, hits);
    if (this.buckets.size > 20_000) this.buckets.clear();
    return true;
  }
}

/**
 * Visitor-facing product search, called by deployed sites. No auth; CORS
 * open (public shopping data). Cache-first with a monthly SerpApi cap so
 * ad traffic can't run up the bill. The SerpApi key never leaves the server.
 */
@Controller('public')
export class PublicSearchController {
  private readonly limiter = new IpRateLimiter();

  constructor(private readonly discovery: DiscoveryService) {}

  @Public()
  @Get('search')
  async search(
    @Req() req: Request,
    @Query('q') q = '',
    @Query('gl') gl = 'us',
  ) {
    if (!this.limiter.allow(req.ip ?? 'anon')) {
      return { results: [], cached: false, capped: false, rate_limited: true };
    }
    const market = /^[a-z]{2}$/.test(gl) ? gl : 'us';
    const out = await this.discovery.publicSearch(String(q), market);
    return { ...out, rate_limited: false };
  }

  /** Home-page products, drawn from recent cached searches (no API cost). */
  @Public()
  @Get('featured')
  async featured(@Query('limit') limit = '12') {
    const n = Math.min(24, Math.max(1, parseInt(String(limit), 10) || 12));
    return { results: await this.discovery.featured(n) };
  }

  /** Auto category rows for the home page (each cached query = a category). */
  @Public()
  @Get('categories')
  async categories(@Query('limit') limit = '8', @Query('per') per = '12') {
    const cats = Math.min(12, Math.max(1, parseInt(String(limit), 10) || 8));
    const per_ = Math.min(20, Math.max(4, parseInt(String(per), 10) || 12));
    return { categories: await this.discovery.categories(cats, per_) };
  }
}
