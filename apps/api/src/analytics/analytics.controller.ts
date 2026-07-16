import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { AuthUser, CurrentUser } from '../auth/current-user.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { AnalyticsService } from './analytics.service';
import { buildCampaignUtm, buildFinalUrl, Platform } from './campaign-links';

class CreateCampaignLinkDto {
  @IsIn(['google', 'meta', 'bing'])
  platform!: Platform;

  @IsString()
  @MinLength(1)
  @MaxLength(120)
  campaign_name!: string;

  @IsOptional() @IsString() @MaxLength(120) utm_content?: string;
  @IsOptional() @IsString() @MaxLength(120) utm_term?: string;
  @IsOptional() @IsString() @MaxLength(2000) notes?: string;
}

@Controller('sites/:id')
export class AnalyticsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly analytics: AnalyticsService,
  ) {}

  @Get('stats')
  async stats(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: Record<string, string>,
  ) {
    await this.assertSite(user.tenantId, id);
    return this.analytics.stats(user.tenantId, id, query);
  }

  @Get('funnel')
  async funnel(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: Record<string, string>,
  ) {
    await this.assertSite(user.tenantId, id);
    return this.analytics.funnel(user.tenantId, id, query);
  }

  @Get('campaign-links')
  async list(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    await this.assertSite(user.tenantId, id);
    return this.prisma.withTenant(user.tenantId, (tx) =>
      tx.campaignLink.findMany({
        where: { siteId: id },
        orderBy: { createdAt: 'desc' },
      }),
    );
  }

  /** §10 POST /sites/:id/campaign-links → final_url ready to paste. */
  @Post('campaign-links')
  async create(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateCampaignLinkDto,
  ) {
    this.requireBuilder(user);
    const site = await this.assertSite(user.tenantId, id);
    const utm = buildCampaignUtm(dto.platform, dto.campaign_name, {
      content: dto.utm_content,
      term: dto.utm_term,
    });
    const finalUrl = buildFinalUrl(site.domain, utm);
    return this.prisma.withTenant(user.tenantId, (tx) =>
      tx.campaignLink.create({
        data: {
          tenantId: user.tenantId,
          siteId: id,
          platform: dto.platform,
          campaignName: dto.campaign_name,
          utm: utm as any,
          finalUrl,
          notes: dto.notes ?? null,
        },
      }),
    );
  }

  @Delete('campaign-links/:linkId')
  @HttpCode(204)
  async remove(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('linkId', ParseUUIDPipe) linkId: string,
  ) {
    this.requireBuilder(user);
    await this.prisma.withTenant(user.tenantId, async (tx) => {
      const link = await tx.campaignLink.findFirst({ where: { id: linkId, siteId: id } });
      if (!link) throw new NotFoundException('Campaign link not found');
      await tx.campaignLink.delete({ where: { id: linkId } });
    });
  }

  private async assertSite(tenantId: string, id: string) {
    const site = await this.prisma.withTenant(tenantId, (tx) =>
      tx.site.findFirst({ where: { id }, select: { id: true, domain: true } }),
    );
    if (!site) throw new NotFoundException('Site not found');
    return site;
  }

  private requireBuilder(user: AuthUser) {
    if (user.role === 'viewer') {
      throw new ForbiddenException('Viewers cannot modify campaign links');
    }
  }
}
