import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
} from '@nestjs/common';
import { Request } from 'express';
import { IsObject, IsOptional, IsString } from 'class-validator';
import { AuthUser, CurrentUser } from '../auth/current-user.decorator';
import { Public } from '../auth/public.decorator';
import { ContentService } from './content.service';

// The global ValidationPipe (whitelist:true) strips any body property not on a
// DTO class, so the public save must declare its shape here.
class SaveContentDto {
  @IsString()
  site_key!: string;

  @IsString()
  edit_key!: string;

  @IsOptional()
  @IsObject()
  edits?: Record<string, unknown>;
}

/** Sliding-window limiter: N saves/min per IP (protects the rebuild pipeline). */
class IpRateLimiter {
  private buckets = new Map<string, number[]>();
  allow(key: string, limit = 12, windowMs = 60_000): boolean {
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

@Controller()
export class ContentController {
  private readonly limiter = new IpRateLimiter();

  constructor(private readonly content: ContentService) {}

  /** Operator: enable/rotate the site's client-editing key. */
  @Post('sites/:id/content-key')
  async generate(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    this.requireBuilder(user);
    const edit_key = await this.content.generateKey(user.tenantId, id);
    return { enabled: true, edit_key };
  }

  /** Operator: get (creating if needed) the key — used to launch the editor. */
  @Post('sites/:id/content-key/ensure')
  async ensure(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    this.requireBuilder(user);
    const edit_key = await this.content.ensureKey(user.tenantId, id);
    return { enabled: true, edit_key };
  }

  /** Operator: current key status (to show/copy the share link). */
  @Get('sites/:id/content-key')
  async status(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.content.keyStatus(user.tenantId, id);
  }

  /** Operator: disable client editing. */
  @Delete('sites/:id/content-key')
  async disable(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    this.requireBuilder(user);
    await this.content.disableKey(user.tenantId, id);
    return { enabled: false };
  }

  /** Public: inline-editor save from a deployed site (token-authed). */
  @Public()
  @Post('public/site-content')
  async save(@Req() req: Request, @Body() body: SaveContentDto) {
    if (!this.limiter.allow(req.ip ?? 'anon')) {
      return { ok: false, rate_limited: true };
    }
    if (!body?.site_key || !body?.edit_key) {
      throw new BadRequestException('site_key and edit_key are required');
    }
    const result = await this.content.saveEdits(body.site_key, body.edit_key, body.edits);
    return { ok: true, ...result };
  }

  private requireBuilder(user: AuthUser) {
    if (user.role === 'viewer') throw new ForbiddenException('Viewers cannot change site settings');
  }
}
