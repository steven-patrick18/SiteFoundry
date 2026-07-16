import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../auth/current-user.decorator';
import { CreateSiteDto, TrackingDto, UpdateSiteDto } from './dto';
import { runPreflight, PreflightResult } from './preflight';

@Injectable()
export class SitesService {
  constructor(private readonly prisma: PrismaService) {}

  list(user: AuthUser) {
    return this.prisma.withTenant(user.tenantId, (tx) =>
      tx.site.findMany({
        orderBy: { createdAt: 'desc' },
        select: {
          id: true, name: true, domain: true, status: true,
          installStatus: true, sslStatus: true, sslExpiresAt: true,
          lighthouseScore: true, publishedAt: true, createdAt: true,
          client: { select: { id: true, name: true } },
          server: { select: { id: true, name: true } },
          template: { select: { id: true, name: true, category: true } },
        },
      }),
    );
  }

  async get(user: AuthUser, id: string) {
    const site = await this.prisma.withTenant(user.tenantId, (tx) =>
      tx.site.findFirst({
        where: { id },
        include: {
          client: true,
          server: {
            select: {
              id: true, name: true, host: true, status: true,
              baseProvisioned: true, facts: true,
            },
          },
          template: {
            select: {
              id: true, name: true, category: true,
              version: true, paramSchema: true,
            },
          },
        },
      }),
    );
    if (!site) throw new NotFoundException('Site not found');
    return site;
  }

  async create(user: AuthUser, dto: CreateSiteDto) {
    return this.prisma.withTenant(user.tenantId, async (tx) => {
      // FK existence checks run tenant-scoped, so cross-tenant IDs 404 here.
      const [client, server, template] = await Promise.all([
        tx.client.findFirst({ where: { id: dto.client_id } }),
        tx.server.findFirst({ where: { id: dto.server_id } }),
        tx.template.findFirst({ where: { id: dto.template_id, status: 'active' } }),
      ]);
      if (!client) throw new BadRequestException('client_id: client not found');
      if (!server) throw new BadRequestException('server_id: server not found');
      if (!template) throw new BadRequestException('template_id: template not found or deprecated');

      const existing = await tx.site.findFirst({ where: { domain: dto.domain } });
      if (existing) {
        throw new ConflictException(`Domain ${dto.domain} is already used by site "${existing.name}"`);
      }

      try {
        const site = await tx.site.create({
          data: {
            tenantId: user.tenantId,
            name: dto.name,
            clientId: dto.client_id,
            serverId: dto.server_id,
            templateId: dto.template_id,
            templateVersion: template.version,
            domain: dto.domain.toLowerCase(),
            extraDomains: (dto.extra_domains ?? []).map((d) => d.toLowerCase()),
            extraAllowedHosts: (dto.extra_allowed_hosts ?? []).map((d) => d.toLowerCase()),
            destinationUrl: dto.destination_url,
            params: dto.params as any,
            ...this.trackingColumns(dto.tracking),
            notes: dto.notes ?? null,
          },
        });
        await tx.auditLog.create({
          data: {
            tenantId: user.tenantId, userId: user.userId,
            action: 'site.create', entityType: 'site', entityId: site.id,
            after: { name: site.name, domain: site.domain },
          },
        });
        return site;
      } catch (e: any) {
        if (e?.code === 'P2002') {
          throw new ConflictException(`Domain ${dto.domain} is already in use`);
        }
        throw e;
      }
    });
  }

  async update(user: AuthUser, id: string, dto: UpdateSiteDto) {
    return this.prisma.withTenant(user.tenantId, async (tx) => {
      const before = await tx.site.findFirst({ where: { id } });
      if (!before) throw new NotFoundException('Site not found');
      const after = await tx.site.update({
        where: { id },
        data: {
          ...(dto.name !== undefined ? { name: dto.name } : {}),
          ...(dto.params !== undefined ? { params: dto.params as any } : {}),
          ...(dto.destination_url !== undefined ? { destinationUrl: dto.destination_url } : {}),
          ...(dto.extra_domains !== undefined
            ? { extraDomains: dto.extra_domains.map((d) => d.toLowerCase()) }
            : {}),
          ...(dto.extra_allowed_hosts !== undefined
            ? { extraAllowedHosts: dto.extra_allowed_hosts.map((d) => d.toLowerCase()) }
            : {}),
          ...(dto.ssl_auto_renew !== undefined ? { sslAutoRenew: dto.ssl_auto_renew } : {}),
          ...(dto.notes !== undefined ? { notes: dto.notes } : {}),
          ...this.trackingColumns(dto.tracking),
        },
      });
      await tx.auditLog.create({
        data: {
          tenantId: user.tenantId, userId: user.userId,
          action: 'site.update', entityType: 'site', entityId: id,
          before: { params: before.params, destinationUrl: before.destinationUrl } as any,
          after: { params: after.params, destinationUrl: after.destinationUrl } as any,
        },
      });
      // TODO(M3): if HTML-affecting fields changed on a live site, queue redeploy.
      return after;
    });
  }

  /** §10 POST /sites/:id/validate — pre-flight only, no server touched. */
  async validate(user: AuthUser, id: string): Promise<PreflightResult> {
    const site = await this.prisma.withTenant(user.tenantId, (tx) =>
      tx.site.findFirst({
        where: { id },
        include: { template: { select: { category: true, paramSchema: true } } },
      }),
    );
    if (!site) throw new NotFoundException('Site not found');
    return runPreflight({
      params: site.params,
      destinationUrl: site.destinationUrl,
      templateCategory: site.template.category,
      paramSchema: site.template.paramSchema,
      extraAllowedHosts: site.extraAllowedHosts,
    });
  }

  async archive(user: AuthUser, id: string) {
    return this.prisma.withTenant(user.tenantId, async (tx) => {
      const site = await tx.site.findFirst({ where: { id } });
      if (!site) throw new NotFoundException('Site not found');
      return tx.site.update({ where: { id }, data: { status: 'archived' } });
    });
  }

  private trackingColumns(t?: TrackingDto) {
    if (!t) return {};
    return {
      ...(t.ga4_id !== undefined ? { ga4Id: t.ga4_id || null } : {}),
      ...(t.meta_pixel_id !== undefined ? { metaPixelId: t.meta_pixel_id || null } : {}),
      ...(t.google_ads_tag !== undefined ? { googleAdsTag: (t.google_ads_tag as any) ?? null } : {}),
      ...(t.bing_uet_tag !== undefined ? { bingUetTag: t.bing_uet_tag || null } : {}),
      ...(t.pushvault_property_key !== undefined
        ? { pushvaultPropertyKey: t.pushvault_property_key || null }
        : {}),
    };
  }
}
