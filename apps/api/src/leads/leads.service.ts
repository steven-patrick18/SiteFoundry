import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../auth/current-user.decorator';

const MAX_FIELDS = 12;
const MAX_VALUE_LEN = 500;

export interface LeadWebhookPayload {
  site: { id: string; name: string; domain: string };
  lead: {
    id: string;
    fields: Record<string, string>;
    consent: true;
    source_utm: Record<string, string> | null;
    at: string;
  };
}

@Injectable()
export class LeadsService {
  private readonly logger = new Logger(LeadsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  /** §10 POST /public/lead — consent mandatory, IP stored as salted hash. */
  async capture(input: {
    siteKey: string;
    fields: unknown;
    consent: unknown;
    utm?: Record<string, string | undefined>;
    ip?: string;
  }): Promise<void> {
    if (input.consent !== true) {
      throw new BadRequestException('Consent is required to submit this form');
    }
    const fields = this.sanitizeFields(input.fields);
    if (Object.keys(fields).length === 0) {
      throw new BadRequestException('At least one field is required');
    }

    const site = await this.prisma.admin.site.findUnique({
      where: { id: input.siteKey },
      select: { id: true, tenantId: true, name: true, domain: true, status: true, leadWebhookUrl: true },
    });
    if (!site || site.status === 'archived') return; // don't leak site existence

    const sourceUtm = this.pickUtm(input.utm);
    const lead = await this.prisma.admin.lead.create({
      data: {
        tenantId: site.tenantId,
        siteId: site.id,
        fields: fields as any,
        consent: true,
        sourceUtm: sourceUtm as any,
        ipHash: input.ip ? this.hashIp(input.ip) : null,
      },
    });

    if (site.leadWebhookUrl) {
      // fire-and-forget with one retry — capture must not block on webhooks
      void this.deliverWebhook(site as any, {
        site: { id: site.id, name: site.name, domain: site.domain },
        lead: {
          id: lead.id, fields, consent: true,
          source_utm: sourceUtm, at: lead.at.toISOString(),
        },
      });
    }
  }

  async list(user: AuthUser, siteId: string) {
    await this.assertSite(user.tenantId, siteId);
    return this.prisma.withTenant(user.tenantId, (tx) =>
      tx.lead.findMany({
        where: { siteId },
        orderBy: { at: 'desc' },
        take: 500,
        select: { id: true, fields: true, sourceUtm: true, at: true },
      }),
    );
  }

  /** §7.9 / §13 — CSV export is audit-logged. */
  async exportCsv(user: AuthUser, siteId: string): Promise<string> {
    const site = await this.assertSite(user.tenantId, siteId);
    const leads = await this.prisma.withTenant(user.tenantId, async (tx) => {
      const rows = await tx.lead.findMany({
        where: { siteId },
        orderBy: { at: 'asc' },
        select: { id: true, fields: true, sourceUtm: true, at: true },
      });
      await tx.auditLog.create({
        data: {
          tenantId: user.tenantId, userId: user.userId,
          action: 'leads.export', entityType: 'site', entityId: siteId,
          after: { count: rows.length, domain: site.domain },
        },
      });
      return rows;
    });

    const fieldKeys = [...new Set(leads.flatMap((l) => Object.keys(l.fields as object)))];
    const header = ['submitted_at', ...fieldKeys, 'utm_source', 'utm_medium', 'utm_campaign'];
    const escape = (v: unknown) => {
      const s = String(v ?? '');
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines = leads.map((l) => {
      const f = l.fields as Record<string, string>;
      const u = (l.sourceUtm ?? {}) as Record<string, string>;
      return [
        l.at.toISOString(),
        ...fieldKeys.map((k) => escape(f[k])),
        escape(u.source), escape(u.medium), escape(u.campaign),
      ].join(',');
    });
    return [header.join(','), ...lines].join('\r\n') + '\r\n';
  }

  async setWebhook(user: AuthUser, siteId: string, url: string | null) {
    if (url) this.validateWebhookUrl(url);
    await this.assertSite(user.tenantId, siteId);
    return this.prisma.withTenant(user.tenantId, async (tx) => {
      const site = await tx.site.update({
        where: { id: siteId },
        data: { leadWebhookUrl: url },
        select: { leadWebhookUrl: true },
      });
      await tx.auditLog.create({
        data: {
          tenantId: user.tenantId, userId: user.userId,
          action: 'leads.webhook_set', entityType: 'site', entityId: siteId,
          after: { url },
        },
      });
      return site;
    });
  }

  /** §7.9 test-send button — delivers a sample payload immediately. */
  async testWebhook(user: AuthUser, siteId: string) {
    const site = await this.assertSite(user.tenantId, siteId);
    if (!site.leadWebhookUrl) {
      throw new BadRequestException('No webhook URL configured');
    }
    const ok = await this.deliverWebhook(site, {
      site: { id: site.id, name: site.name, domain: site.domain },
      lead: {
        id: '00000000-0000-0000-0000-000000000000',
        fields: { name: 'Test Lead', email: 'test@example.com', phone: '+1 (555) 010-0000' },
        consent: true,
        source_utm: { source: 'google', medium: 'cpc', campaign: 'webhook-test' },
        at: new Date().toISOString(),
      },
    });
    return { delivered: ok };
  }

  // ── helpers ────────────────────────────────────────────────────────────

  private async deliverWebhook(
    site: { id: string; tenantId?: string; leadWebhookUrl: string | null },
    payload: LeadWebhookPayload,
    attempt = 1,
  ): Promise<boolean> {
    if (!site.leadWebhookUrl) return false;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10_000);
    try {
      const res = await fetch(site.leadWebhookUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'user-agent': 'SiteFoundry-Webhook/1.0' },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return true;
    } catch (err: any) {
      if (attempt < 2) {
        await new Promise((r) => setTimeout(r, 2000));
        return this.deliverWebhook(site, payload, attempt + 1);
      }
      this.logger.warn(`lead webhook failed for site ${site.id}: ${err?.message ?? err}`);
      return false;
    } finally {
      clearTimeout(timer);
    }
  }

  private sanitizeFields(raw: unknown): Record<string, string> {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
    const out: Record<string, string> = {};
    for (const [key, value] of Object.entries(raw as Record<string, unknown>).slice(0, MAX_FIELDS)) {
      const k = key.replace(/[^\w-]/g, '').slice(0, 40);
      if (!k || value == null) continue;
      out[k] = String(value).slice(0, MAX_VALUE_LEN);
    }
    return out;
  }

  private pickUtm(utm?: Record<string, string | undefined>): Record<string, string> | null {
    if (!utm) return null;
    const out: Record<string, string> = {};
    for (const key of ['source', 'medium', 'campaign', 'content', 'term']) {
      const v = utm[key];
      if (typeof v === 'string' && v) out[key] = v.slice(0, 200);
    }
    return Object.keys(out).length ? out : null;
  }

  private hashIp(ip: string): string {
    const salt = this.config.get<string>('LEAD_IP_SALT', 'dev-lead-salt');
    return createHash('sha256').update(`${salt}:${ip}`).digest('hex');
  }

  private validateWebhookUrl(url: string) {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      throw new BadRequestException('Webhook URL is not a valid URL');
    }
    const isLocal = ['localhost', '127.0.0.1', '::1'].includes(parsed.hostname);
    const devMode = this.config.get<string>('NODE_ENV') !== 'production';
    if (parsed.protocol !== 'https:' && !(devMode && isLocal)) {
      throw new BadRequestException('Webhook URL must be HTTPS');
    }
  }

  private async assertSite(tenantId: string, siteId: string) {
    const site = await this.prisma.withTenant(tenantId, (tx) =>
      tx.site.findFirst({
        where: { id: siteId },
        select: { id: true, name: true, domain: true, leadWebhookUrl: true },
      }),
    );
    if (!site) throw new NotFoundException('Site not found');
    return site;
  }
}
