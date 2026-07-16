import {
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { AppConfigService } from '../settings/app-config.service';
import { DiscoveredProduct, normalizeShoppingResults } from './normalize';

const CACHE_TTL_DAYS = 7;
const SERPAPI_CONFIG_KEY = 'serpapi_key';

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
 * result cache so repeated queries cost zero API credits. The API key is
 * resolved from the app_config table (set in the Settings UI) first, then
 * the SERPAPI_KEY env var. Imported products are stored in the site itself
 * (static build) — visitors never hit the API.
 */
@Injectable()
export class DiscoveryService {
  private readonly logger = new Logger(DiscoveryService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly appConfig: AppConfigService,
  ) {}

  private async resolveKey(): Promise<string> {
    const dbKey = await this.appConfig.get(SERPAPI_CONFIG_KEY).catch(() => null);
    return (dbKey || this.config.get<string>('SERPAPI_KEY') || '').trim();
  }

  async isEnabled(): Promise<boolean> {
    return !!(await this.resolveKey());
  }

  async search(query: string, gl = 'us'): Promise<DiscoveryResponse> {
    const q = query.trim().toLowerCase();
    if (q.length < 2) throw new BadRequestException('Query too short');
    const apiKey = await this.resolveKey();
    if (!apiKey) {
      throw new ServiceUnavailableException(
        'Product discovery is not configured — set the SerpApi key in Settings → Integrations',
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
    url.searchParams.set('api_key', apiKey);

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

  /**
   * Visitor-facing search (called from deployed sites). Cache-first, and
   * capped: once the month's SerpApi budget is spent, cache misses return
   * empty (capped: true) instead of spending more credits — protects the
   * API budget from ad-traffic abuse.
   */
  async publicSearch(
    query: string,
    gl = 'us',
  ): Promise<{ results: DiscoveredProduct[]; cached: boolean; capped: boolean }> {
    const q = query.trim().toLowerCase();
    if (q.length < 2) return { results: [], cached: false, capped: false };
    const apiKey = await this.resolveKey();
    if (!apiKey) return { results: [], cached: false, capped: false };

    const freshSince = new Date(Date.now() - CACHE_TTL_DAYS * 24 * 3600 * 1000);
    const cached = await this.prisma.admin.searchCache.findFirst({
      where: { engine: 'google_shopping', query: q, gl, fetchedAt: { gte: freshSince } },
      orderBy: { fetchedAt: 'desc' },
    });
    if (cached) {
      return { results: cached.results as unknown as DiscoveredProduct[], cached: true, capped: false };
    }

    // cache miss — only spend a credit if under the monthly cap
    const cap = this.config.get<number>('SERPAPI_MONTHLY_CAP', 200);
    if ((await this.monthlyUsage()) >= cap) {
      return { results: [], cached: false, capped: true };
    }
    try {
      const fresh = await this.search(q, gl);
      return { results: fresh.results, cached: false, capped: false };
    } catch {
      return { results: [], cached: false, capped: false };
    }
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
