import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Header,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
} from '@nestjs/common';
import { Request } from 'express';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import { AuthUser, CurrentUser } from '../auth/current-user.decorator';
import { Public } from '../auth/public.decorator';
import { LeadsService } from './leads.service';

class WebhookDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  url?: string | null;
}

/** Sliding-window limiter: 5 leads/min per IP (§13). */
class IpRateLimiter {
  private buckets = new Map<string, number[]>();

  allow(key: string, limit = 5, windowMs = 60_000): boolean {
    const now = Date.now();
    const hits = (this.buckets.get(key) ?? []).filter((t) => now - t < windowMs);
    if (hits.length >= limit) {
      this.buckets.set(key, hits);
      return false;
    }
    hits.push(now);
    this.buckets.set(key, hits);
    if (this.buckets.size > 10_000) this.buckets.clear();
    return true;
  }
}

@Controller()
export class LeadsController {
  private readonly limiter = new IpRateLimiter();

  constructor(private readonly leads: LeadsService) {}

  /** §10 POST /public/lead {site_key, fields, consent:true} — no auth.
   * Body arrives as text/plain (sendBeacon/simple request; the /public
   * prefix is text-parsed in main.ts). */
  @Public()
  @Post('public/lead')
  @HttpCode(204)
  async capture(@Req() req: Request): Promise<void> {
    if (!this.limiter.allow(req.ip ?? 'anon')) {
      throw new ForbiddenException('Too many submissions — try again in a minute');
    }
    const body = this.parseBody(req);
    await this.leads.capture({
      siteKey: String(body.site_key ?? ''),
      fields: body.fields,
      consent: body.consent,
      utm: {
        source: this.str(body.utm_source),
        medium: this.str(body.utm_medium),
        campaign: this.str(body.utm_campaign),
        content: this.str(body.utm_content),
        term: this.str(body.utm_term),
      },
      ip: req.ip,
    });
  }

  @Get('sites/:id/leads')
  list(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.leads.list(user, id);
  }

  /** §10 GET /sites/:id/leads/export — CSV, audit-logged. */
  @Get('sites/:id/leads/export')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="leads.csv"')
  exportCsv(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.leads.exportCsv(user, id);
  }

  /** §10 PATCH /sites/:id/leads/webhook {url} (null/empty clears). */
  @Patch('sites/:id/leads/webhook')
  setWebhook(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: WebhookDto,
  ) {
    this.requireBuilder(user);
    return this.leads.setWebhook(user, id, dto.url?.trim() || null);
  }

  @Post('sites/:id/leads/webhook-test')
  testWebhook(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    this.requireBuilder(user);
    return this.leads.testWebhook(user, id);
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

  private str(v: unknown): string | undefined {
    return typeof v === 'string' && v ? v.slice(0, 200) : undefined;
  }

  private requireBuilder(user: AuthUser) {
    if (user.role === 'viewer') {
      throw new ForbiddenException('Viewers cannot modify lead settings');
    }
  }
}
