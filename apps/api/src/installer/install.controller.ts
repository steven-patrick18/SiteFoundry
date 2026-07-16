import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Headers,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Response } from 'express';
import { IsUUID } from 'class-validator';
import { AuthUser, CurrentUser } from '../auth/current-user.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { ProgressBus } from '../jobs/progress-bus';
import { JobRunner } from '../jobs/job-runner';
import { Public } from '../auth/public.decorator';
import { INSTALL_STEPS, InstallStep, InstallerService } from './installer.service';

class RollbackDto {
  @IsUUID()
  build_id!: string;
}

@Controller()
export class InstallController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly bus: ProgressBus,
    private readonly jobs: JobRunner,
    private readonly installer: InstallerService,
    private readonly config: ConfigService,
  ) {}

  /** §10 POST /sites/:id/install → SSE stream of the state machine. */
  @Post('sites/:id/install')
  async install(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Query('from') from: string | undefined,
    @Res() res: Response,
  ) {
    this.requireBuilder(user);
    const fromStep = this.parseStep(from) ?? 'preflight';
    await this.assertSiteExists(user.tenantId, id);
    this.openSse(res);
    const unsubscribe = this.subscribeSse(id, res);
    await this.jobs.enqueueInstall({
      tenantId: user.tenantId, userId: user.userId, siteId: id, fromStep,
    });
    res.on('close', unsubscribe);
  }

  /** §10 GET /sites/:id/install-status — EventSource-compatible re-attach. */
  @Get('sites/:id/install-status')
  async installStatus(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Res() res: Response,
  ) {
    const site = await this.assertSiteExists(user.tenantId, id);
    this.openSse(res);
    // replay current state so late viewers see where things stand
    res.write(`data: ${JSON.stringify({
      step: 'status', title: `Install status: ${site.installStatus}`,
      status: site.installStatus === 'failed' ? 'fail' : 'start',
    })}\n\n`);
    const unsubscribe = this.subscribeSse(id, res);
    res.on('close', unsubscribe);
  }

  /** §10 POST /sites/:id/rebuild — re-runs from deploying_files. */
  @Post('sites/:id/rebuild')
  async rebuild(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Res() res: Response,
  ) {
    this.requireBuilder(user);
    await this.assertSiteExists(user.tenantId, id);
    this.openSse(res);
    const unsubscribe = this.subscribeSse(id, res);
    await this.jobs.enqueueInstall({
      tenantId: user.tenantId, userId: user.userId, siteId: id,
      fromStep: 'deploying_files',
    });
    res.on('close', unsubscribe);
  }

  /** §10 POST /sites/:id/rollback {build_id} — swap artifact in < 10 s. */
  @Post('sites/:id/rollback')
  async rollback(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RollbackDto,
  ) {
    this.requireBuilder(user);
    await this.installer.rollback(user.tenantId, user.userId, id, dto.build_id);
    return { ok: true, build_id: dto.build_id };
  }

  /** §10 POST /sites/:id/renew-ssl — force certbot renewal now. */
  @Post('sites/:id/renew-ssl')
  async renewSsl(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    this.requireBuilder(user);
    return this.installer.renewSsl(user.tenantId, id);
  }

  @Get('sites/:id/builds')
  async builds(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    await this.assertSiteExists(user.tenantId, id);
    return this.prisma.withTenant(user.tenantId, (tx) =>
      tx.build.findMany({
        where: { siteId: id },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true, status: true, durationMs: true,
          lighthouseScore: true, createdAt: true, artifactPath: true,
        },
      }),
    );
  }

  @Get('sites/:id/deploy-events')
  async deployEvents(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    await this.assertSiteExists(user.tenantId, id);
    return this.prisma.withTenant(user.tenantId, (tx) =>
      tx.deployEvent.findMany({
        where: { siteId: id },
        orderBy: { at: 'desc' },
        take: 100,
      }),
    );
  }

  /** Certbot deploy-hook on the server posts here after auto-renewal. */
  @Public()
  @Post('internal/ssl-renewed/:siteId')
  async sslRenewed(
    @Param('siteId') siteId: string,
    @Headers('x-internal-secret') secret: string | undefined,
    @Body() body: { expires_at?: string },
  ) {
    if (secret !== this.config.get<string>('INTERNAL_SECRET')) {
      throw new ForbiddenException('Bad internal secret');
    }
    // owner-level update: renewal hooks carry no tenant context
    const expiresAt = body?.expires_at ? new Date(body.expires_at) : null;
    await this.prisma.admin.site.updateMany({
      where: { id: siteId },
      data: {
        sslStatus: 'active',
        ...(expiresAt && !Number.isNaN(expiresAt.getTime()) ? { sslExpiresAt: expiresAt } : {}),
      },
    });
    return { ok: true };
  }

  // ── helpers ──────────────────────────────────────────────────────────

  private parseStep(from?: string): InstallStep | undefined {
    if (!from) return undefined;
    if (!INSTALL_STEPS.includes(from as InstallStep)) {
      throw new BadRequestException(`from must be one of: ${INSTALL_STEPS.join(', ')}`);
    }
    return from as InstallStep;
  }

  private async assertSiteExists(tenantId: string, id: string) {
    const site = await this.prisma.withTenant(tenantId, (tx) =>
      tx.site.findFirst({ where: { id }, select: { id: true, installStatus: true } }),
    );
    if (!site) throw new BadRequestException('Site not found');
    return site;
  }

  private openSse(res: Response) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();
  }

  private subscribeSse(siteId: string, res: Response): () => void {
    const unsubscribe = this.bus.subscribe(siteId, (event) => {
      res.write(`data: ${JSON.stringify(event)}\n\n`);
      if (event.status === 'done' || event.status === 'fail') {
        // keep stream open briefly so the client flushes, then end
        setTimeout(() => res.end(), 200);
      }
    });
    return unsubscribe;
  }

  private requireBuilder(user: AuthUser) {
    if (user.role === 'viewer') {
      throw new ForbiddenException('Viewers cannot deploy');
    }
  }
}
