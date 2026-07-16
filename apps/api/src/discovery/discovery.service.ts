import {
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { DiscoveredProduct, normalizeShoppingResults } from './normalize';

const CACHE_TTL_DAYS = 7;

export interface DiscoveryResponse {
  query: string;
  gl: string;
  cached: boolean;
  fetched_at: string;
  results: DiscoveredProduct[];
  api_searches_this_month: number;
}

/**
 * Product discovery via SerpApi's Google Shopping engine, with a local
 * result cache so repeated queries cost zero API credits. Imported products
 * are stored in the site itself (static build) — visitors never hit the API.
 */
@Injectable()
export class DiscoveryService {
  private readonly logger = new Logger(DiscoveryService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  get enabled(): boolean {
    return !!this.config.get<string>('SERPAPI_KEY');
  }

  async search(query: string, gl = 'us'): Promise<DiscoveryResponse> {
    const q = query.trim().toLowerCase();
    if (q.length < 2) throw new BadRequestException('Query too short');
    if (!this.enabled) {
      throw new ServiceUnavailableException(
        'Product discovery is not configured — set SERPAPI_KEY in the panel environment',
      );
    }

    // 1. local cache first (free)
    const freshSince = new Date(Date.now() - CACHE_TTL_DAYS * 24 * 3600 * 1000);
    const cached = await this.prisma.admin.searchCache.findFirst({
      where: { engine: 'google_shopping', query: q, gl, fetchedAt: { gte: freshSince } },
      orderBy: { fetchedAt: 'desc' },
    });
    if (cached) {
      return {
        query: q, gl, cached: true,
        fetched_at: cached.fetchedAt.toISOString(),
        results: cached.results as unknown as DiscoveredProduct[],
        api_searches_this_month: await this.monthlyUsage(),
      };
    }

    // 2. SerpApi (spends one search credit)
    const url = new URL('https://serpapi.com/search.json');
    url.searchParams.set('engine', 'google_shopping');
    url.searchParams.set('q', q);
    url.searchParams.set('gl', gl);
    url.searchParams.set('hl', 'en');
    url.searchParams.set('api_key', this.config.get<string>('SERPAPI_KEY')!);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20_000);
    let raw: any;
    try {
      const res = await fetch(url, { signal: controller.signal });
      raw = await res.json();
      if (!res.ok || raw.error) {
        throw new Error(raw.error ?? `SerpApi HTTP ${res.status}`);
      }
    } catch (err: any) {
      throw new ServiceUnavailableException(
        `Product search failed: ${String(err?.message ?? err).slice(0, 200)}`,
      );
    } finally {
      clearTimeout(timer);
    }

    const results = normalizeShoppingResults(raw);
    const row = await this.prisma.admin.searchCache.create({
      data: { engine: 'google_shopping', query: q, gl, results: results as any },
    });
    this.logger.log(`SerpApi search "${q}" (${results.length} results, cached)`);

    return {
      query: q, gl, cached: false,
      fetched_at: row.fetchedAt.toISOString(),
      results,
      api_searches_this_month: await this.monthlyUsage(),
    };
  }

  /** Distinct API fetches this calendar month = credits spent via the panel. */
  usageThisMonth(): Promise<number> {
    return this.monthlyUsage();
  }

  private async monthlyUsage(): Promise<number> {
    const monthStart = new Date();
    monthStart.setUTCDate(1);
    monthStart.setUTCHours(0, 0, 0, 0);
    return this.prisma.admin.searchCache.count({
      where: { fetchedAt: { gte: monthStart } },
    });
  }
}
