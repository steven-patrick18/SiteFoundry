import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { VaultService } from '../vault/vault.service';
import { SshService, SshSession } from '../servers/ssh.service';
import { BuildService } from '../builds/build.service';
import { ProgressBus, InstallEvent } from '../jobs/progress-bus';
import { runPreflight } from '../sites/preflight';
import { sanitizeForLog, outputTail } from '../vault/sanitize';
import { generateVhost, sitePaths, systemUserFor } from './nginx';

/** §9 install state machine step order. Retry resumes from a failed step. */
export const INSTALL_STEPS = [
  'preflight',
  'creating_user',
  'deploying_files',
  'configuring_nginx',
  'issuing_ssl',
  'injecting_tracking',
  'verifying',
] as const;
export type InstallStep = (typeof INSTALL_STEPS)[number];

const STEP_TITLES: Record<InstallStep, string> = {
  preflight: 'Pre-flight validation',
  creating_user: 'Creating isolated site user',
  deploying_files: 'Building template and deploying files',
  configuring_nginx: 'Configuring nginx virtual host',
  issuing_ssl: "Issuing SSL certificate (Let's Encrypt)",
  injecting_tracking: 'Verifying tracking injection',
  verifying: 'Final verification',
};

interface InstallContext {
  tenantId: string;
  userId: string | null;
  site: any;
  server: any;
  session: SshSession;
  distDir?: string;
  buildId?: string;
  artifactKey?: string;
}

@Injectable()
export class InstallerService {
  private readonly logger = new Logger(InstallerService.name);
  private readonly running = new Set<string>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly vault: VaultService,
    private readonly ssh: SshService,
    private readonly builds: BuildService,
    private readonly bus: ProgressBus,
    private readonly config: ConfigService,
  ) {}

  isRunning(siteId: string): boolean {
    return this.running.has(siteId);
  }

  /**
   * Run the install pipeline for a site, emitting progress on the bus and
   * recording deploy_events. `fromStep` resumes a failed install (§9).
   */
  async run(
    tenantId: string,
    userId: string | null,
    siteId: string,
    fromStep: InstallStep = 'preflight',
  ): Promise<void> {
    if (this.running.has(siteId)) {
      this.emit(siteId, { step: 'queued', title: 'Install', status: 'fail', detail: 'An install is already running for this site' });
      return;
    }
    this.running.add(siteId);
    try {
      await this.execute(tenantId, userId, siteId, fromStep);
    } finally {
      this.running.delete(siteId);
    }
  }

  private async execute(
    tenantId: string,
    userId: string | null,
    siteId: string,
    fromStep: InstallStep,
  ): Promise<void> {
    const site = await this.prisma.withTenant(tenantId, (tx) =>
      tx.site.findFirst({
        where: { id: siteId },
        include: {
          template: true,
          server: { include: { credential: true } },
          client: { select: { name: true } },
        },
      }),
    );
    if (!site) throw new NotFoundException('Site not found');

    const startIndex = INSTALL_STEPS.indexOf(fromStep);
    await this.setInstallStatus(tenantId, siteId, 'queued');

    // ── preflight (no server touched) ────────────────────────────────────
    if (startIndex <= 0) {
      this.emit(siteId, this.evt('preflight', 'start'));
      const result = runPreflight({
        params: site.params,
        destinationUrl: site.destinationUrl,
        templateCategory: site.template.category,
        paramSchema: site.template.paramSchema,
        extraAllowedHosts: site.extraAllowedHosts,
      });
      if (!result.ok) {
        await this.fail(tenantId, siteId, site.serverId, 'preflight',
          `${result.errors.length} validation error(s): ` +
          result.errors.map((e) => `${e.field}: ${e.message}`).join('; '));
        return;
      }
      this.emit(siteId, this.evt('preflight', 'ok'));
    }

    // ── open SSH once for all server steps ───────────────────────────────
    let session: SshSession;
    try {
      session = await this.openSession(site.server);
    } catch (err: any) {
      await this.fail(tenantId, siteId, site.serverId, 'creating_user',
        `SSH connection failed: ${sanitizeForLog(String(err?.message ?? err))}`);
      return;
    }

    const ctx: InstallContext = {
      tenantId, userId, site, server: site.server, session,
    };

    const steps: Array<[InstallStep, (c: InstallContext) => Promise<string | void>]> = [
      ['creating_user', (c) => this.stepCreateUser(c)],
      ['deploying_files', (c) => this.stepDeployFiles(c)],
      ['configuring_nginx', (c) => this.stepConfigureNginx(c)],
      ['issuing_ssl', (c) => this.stepIssueSsl(c)],
      ['injecting_tracking', (c) => this.stepVerifyTracking(c)],
      ['verifying', (c) => this.stepFinalVerify(c)],
    ];

    try {
      // Resuming after deploying_files needs the last build's dist restored.
      if (startIndex > INSTALL_STEPS.indexOf('deploying_files')) {
        await this.restoreLastBuild(ctx);
      }

      for (const [step, runner] of steps) {
        if (INSTALL_STEPS.indexOf(step) < startIndex) continue;
        await this.setInstallStatus(tenantId, siteId, step);
        this.emit(siteId, this.evt(step, 'start'));
        await this.recordEvent(tenantId, siteId, site.serverId, step, 'start');
        try {
          const detail = await runner(ctx);
          await this.recordEvent(tenantId, siteId, site.serverId, step, 'ok', detail ?? '');
          this.emit(siteId, this.evt(step, step === 'issuing_ssl' && detail === 'skipped' ? 'skipped' : 'ok', detail ?? undefined));
        } catch (err: any) {
          const message = sanitizeForLog(String(err?.message ?? err));
          await this.fail(tenantId, siteId, site.serverId, step, message);
          return;
        }
      }

      // ── live ─────────────────────────────────────────────────────────────
      await this.prisma.withTenant(tenantId, (tx) =>
        tx.site.update({
          where: { id: siteId },
          data: {
            installStatus: 'live',
            status: 'published',
            publishedAt: new Date(),
            lastVerifiedAt: new Date(),
            ...(ctx.buildId ? { lastBuildId: ctx.buildId } : {}),
          },
        }),
      );
      this.emit(siteId, {
        step: 'live', title: `Site live at https://${site.domain}`, status: 'done',
      });
    } finally {
      session.close();
    }
  }

  // ── steps ───────────────────────────────────────────────────────────────

  private async stepCreateUser(ctx: InstallContext): Promise<string> {
    const user = systemUserFor(ctx.site.id);
    const paths = sitePaths(user, ctx.site.id);
    const cmd = [
      `id -u ${user} >/dev/null 2>&1 || sudo -n useradd -m -s /bin/bash ${user}`,
      `sudo -n mkdir -p ${paths.documentRoot} ${paths.releasesDir}`,
      `sudo -n chown -R ${user}:${user} ${paths.home}`,
      `sudo -n chmod 750 ${paths.home} ${paths.documentRoot}`,
      // nginx (www-data) must traverse into the docroot
      `sudo -n usermod -aG ${user} www-data 2>/dev/null || true`,
    ].join(' && ');
    const result = await ctx.session.exec(cmd, 60_000);
    if (result.code !== 0) {
      throw new Error(this.sudoHint(result.stderr || result.stdout));
    }
    await this.prisma.withTenant(ctx.tenantId, (tx) =>
      tx.site.update({
        where: { id: ctx.site.id },
        data: { siteSystemUser: user, documentRoot: paths.documentRoot },
      }),
    );
    return `user ${user}, docroot ${paths.documentRoot}`;
  }

  private async stepDeployFiles(ctx: InstallContext): Promise<string> {
    // 1. build record + astro build on the panel host
    const build = await this.prisma.withTenant(ctx.tenantId, (tx) =>
      tx.build.create({
        data: {
          tenantId: ctx.tenantId, siteId: ctx.site.id,
          status: 'building', createdBy: ctx.userId,
        },
      }),
    );
    ctx.buildId = build.id;

    let output;
    try {
      output = await this.builds.run({
        buildId: build.id,
        siteId: ctx.site.id,
        domain: ctx.site.domain,
        category: ctx.site.template.category,
        destinationUrl: ctx.site.destinationUrl,
        params: ctx.site.params,
        tracking: this.trackingOf(ctx.site),
        templatePackageKey: ctx.site.template.repoPath?.endsWith('.zip')
          ? ctx.site.template.repoPath
          : null,
      });
    } catch (err: any) {
      await this.prisma.withTenant(ctx.tenantId, (tx) =>
        tx.build.update({
          where: { id: build.id },
          data: { status: 'failed', log: outputTail(String(err?.message ?? err), 4000) },
        }),
      );
      throw err;
    }

    ctx.distDir = output.distDir;
    ctx.artifactKey = output.artifactKey;
    await this.prisma.withTenant(ctx.tenantId, (tx) =>
      tx.build.update({
        where: { id: build.id },
        data: {
          status: 'success',
          artifactPath: output.artifactKey,
          durationMs: output.durationMs,
          log: outputTail(output.log, 4000),
        },
      }),
    );

    // 2. ship artifact + atomic swap on the server
    await this.deployArtifact(ctx, build.id, output.artifactKey);
    return `build ${build.id.slice(0, 8)} deployed (${Math.round(output.durationMs / 100) / 10}s build)`;
  }

  /** Upload artifact zip and atomically swap it into the docroot (also used by rollback). */
  private async deployArtifact(ctx: InstallContext, buildId: string, artifactKey: string) {
    const user = ctx.site.siteSystemUser ?? systemUserFor(ctx.site.id);
    const paths = sitePaths(user, ctx.site.id);
    const localZip = await this.builds.restoreDist(buildId, artifactKey); // ensures artifact exists locally
    const zipLocal = `${this.builds.buildDir(buildId)}.upload.zip`;
    const AdmZip = (await import('adm-zip')).default;
    const zip = new AdmZip();
    zip.addLocalFolder(localZip);
    await (await import('node:fs/promises')).writeFile(zipLocal, zip.toBuffer());

    const remoteZip = `/tmp/sf-${buildId}.zip`;
    await ctx.session.uploadFile(zipLocal, remoteZip);
    const release = `${paths.releasesDir}/${buildId}`;
    const swap = [
      `command -v unzip >/dev/null || sudo -n DEBIAN_FRONTEND=noninteractive apt-get install -y unzip`,
      `sudo -n rm -rf ${release}`,
      `sudo -n mkdir -p ${release}`,
      `sudo -n unzip -q ${remoteZip} -d ${release}`,
      `sudo -n chown -R ${user}:${user} ${release}`,
      `sudo -n chmod -R o+rX ${release}`,
      `sudo -n rm -rf ${paths.documentRoot}.old`,
      `[ -d ${paths.documentRoot} ] && sudo -n mv ${paths.documentRoot} ${paths.documentRoot}.old || true`,
      `sudo -n mv ${release} ${paths.documentRoot}`,
      `sudo -n rm -f ${remoteZip}`,
    ].join(' && ');
    const result = await ctx.session.exec(swap, 180_000);
    if (result.code !== 0) {
      throw new Error(this.sudoHint(result.stderr || result.stdout));
    }
  }

  private async stepConfigureNginx(ctx: InstallContext): Promise<string> {
    const user = ctx.site.siteSystemUser ?? systemUserFor(ctx.site.id);
    const paths = sitePaths(user, ctx.site.id);
    const vhost = generateVhost({
      siteSystemUser: user,
      domain: ctx.site.domain,
      extraDomains: ctx.site.extraDomains ?? [],
      documentRoot: paths.documentRoot,
    });
    const b64 = Buffer.from(vhost, 'utf8').toString('base64');
    const cmd = [
      `echo ${b64} | base64 -d | sudo -n tee ${paths.vhostAvailable} >/dev/null`,
      `sudo -n ln -sf ${paths.vhostAvailable} ${paths.vhostEnabled}`,
      `sudo -n nginx -t`,
      `sudo -n systemctl reload nginx`,
    ].join(' && ');
    const result = await ctx.session.exec(cmd, 60_000);
    if (result.code !== 0) {
      // §13: nginx -t failure surfaces the error without crashing the worker
      throw new Error(`nginx config test failed: ${outputTail(result.stderr || result.stdout)}`);
    }
    return `vhost ${paths.vhostAvailable}`;
  }

  private async stepIssueSsl(ctx: InstallContext): Promise<string> {
    if (this.config.get<string>('SKIP_SSL') === 'true') {
      await this.prisma.withTenant(ctx.tenantId, (tx) =>
        tx.site.update({ where: { id: ctx.site.id }, data: { sslStatus: 'none' } }),
      );
      return 'skipped';
    }
    await this.prisma.withTenant(ctx.tenantId, (tx) =>
      tx.site.update({ where: { id: ctx.site.id }, data: { sslStatus: 'issuing' } }),
    );
    const email =
      this.config.get<string>('CERTBOT_EMAIL') ||
      ctx.site.params?.trust?.contact_email ||
      'admin@example.com';
    const domains = [ctx.site.domain, ...(ctx.site.extraDomains ?? [])]
      .map((d: string) => `-d ${d}`)
      .join(' ');
    const cmd = `sudo -n certbot --nginx ${domains} --non-interactive --agree-tos -m ${email} --redirect`;
    const result = await ctx.session.exec(cmd, 300_000);
    if (result.code !== 0) {
      await this.prisma.withTenant(ctx.tenantId, (tx) =>
        tx.site.update({ where: { id: ctx.site.id }, data: { sslStatus: 'none' } }),
      );
      throw new Error(`certbot failed: ${outputTail(result.stderr || result.stdout)}`);
    }
    // read the actual expiry from the issued certificate
    const expiry = await ctx.session.exec(
      `sudo -n openssl x509 -enddate -noout -in /etc/letsencrypt/live/${ctx.site.domain}/cert.pem`,
      30_000,
    );
    let expiresAt: Date | null = null;
    const match = expiry.stdout.match(/notAfter=(.+)/);
    if (match) {
      const parsed = new Date(match[1].trim());
      if (!Number.isNaN(parsed.getTime())) expiresAt = parsed;
    }
    await this.prisma.withTenant(ctx.tenantId, (tx) =>
      tx.site.update({
        where: { id: ctx.site.id },
        data: { sslStatus: 'active', sslExpiresAt: expiresAt },
      }),
    );

    // §9: per-site certbot deploy hook — after every auto-renewal the server
    // notifies the panel so ssl_expires_at stays current.
    await this.installRenewalHook(ctx);

    return expiresAt ? `valid until ${expiresAt.toISOString().slice(0, 10)}` : 'issued';
  }

  /** Writes /etc/letsencrypt/renewal-hooks/deploy/sitefoundry-{site}.sh. */
  private async installRenewalHook(ctx: InstallContext): Promise<void> {
    const panelUrl = (this.config.get<string>('PANEL_PUBLIC_URL') ??
      this.config.get<string>('APP_BASE_URL', '')).replace(/\/$/, '');
    const secret = this.config.get<string>('INTERNAL_SECRET', '');
    if (!panelUrl || !secret) return; // hook is best-effort
    const hookName = `sitefoundry-${ctx.site.id.replace(/-/g, '').slice(0, 12)}.sh`;
    const script = [
      '#!/bin/sh',
      `# SiteFoundry: notify panel after renewal of ${ctx.site.domain}`,
      `case "$RENEWED_DOMAINS" in *${ctx.site.domain}*)`,
      `  EXP=$(openssl x509 -enddate -noout -in "$RENEWED_LINEAGE/cert.pem" | cut -d= -f2)`,
      `  curl -fsS -m 10 -X POST "${panelUrl}/api/v1/internal/ssl-renewed/${ctx.site.id}" \\`,
      `    -H "content-type: application/json" -H "x-internal-secret: ${secret}" \\`,
      `    -d "{\\"expires_at_raw\\":\\"$EXP\\"}" || true`,
      ';; esac',
      '',
    ].join('\n');
    const b64 = Buffer.from(script, 'utf8').toString('base64');
    const cmd = [
      `sudo -n mkdir -p /etc/letsencrypt/renewal-hooks/deploy`,
      `echo ${b64} | base64 -d | sudo -n tee /etc/letsencrypt/renewal-hooks/deploy/${hookName} >/dev/null`,
      `sudo -n chmod +x /etc/letsencrypt/renewal-hooks/deploy/${hookName}`,
    ].join(' && ');
    const result = await ctx.session.exec(cmd, 60_000);
    if (result.code !== 0) {
      this.logger.warn(`renewal hook install failed for ${ctx.site.domain}: ${outputTail(result.stderr || result.stdout)}`);
    }
  }

  private async stepVerifyTracking(ctx: InstallContext): Promise<string> {
    if (!ctx.distDir) await this.restoreLastBuild(ctx);
    const t = this.trackingOf(ctx.site);
    const verification = await this.builds.verifyDist(ctx.distDir!, {
      claims: Array.isArray(ctx.site.params?.ad_claims) ? ctx.site.params.ad_claims : [],
      ga4Id: t.ga4_id,
      metaPixelId: t.meta_pixel_id,
      googleAdsConversionId: t.google_ads_conversion_id,
      bingUetTag: t.bing_uet_tag,
      pushvaultKey: t.pushvault_property_key,
      requireDisclosurePage: ['prelander', 'comparison'].includes(ctx.site.template.category),
    });
    if (!verification.ok) {
      throw new Error(`Tracking/claims verification failed: ${verification.missing.join('; ')}`);
    }
    return 'all tags and claims verified in HTML';
  }

  private async stepFinalVerify(ctx: InstallContext): Promise<string> {
    const skipSsl = this.config.get<string>('SKIP_SSL') === 'true';
    const scheme = skipSsl ? 'http' : 'https';
    const url = `${scheme}://${ctx.site.domain}/`;
    const checks: string[] = [];

    const fetchPage = async (path: string) => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 15_000);
      try {
        const res = await fetch(`${scheme}://${ctx.site.domain}${path}`, {
          signal: controller.signal, redirect: 'follow',
        });
        return res;
      } finally {
        clearTimeout(timer);
      }
    };

    const home = await fetchPage('/');
    if (home.status !== 200) throw new Error(`${url} returned HTTP ${home.status}`);
    checks.push('HTTPS 200');

    const html = await home.text();
    const claims: string[] = Array.isArray(ctx.site.params?.ad_claims) ? ctx.site.params.ad_claims : [];
    for (const claim of claims) {
      if (!html.includes(claim)) throw new Error(`Live page missing ad claim: "${claim}"`);
    }
    checks.push('claims on live page');

    const legalPages = ['/privacy/', '/terms/', '/contact/'];
    if (['prelander', 'comparison'].includes(ctx.site.template.category)) legalPages.push('/disclosure/');
    for (const page of legalPages) {
      const res = await fetchPage(page);
      if (res.status !== 200) throw new Error(`Legal page ${page} returned HTTP ${res.status}`);
    }
    checks.push('legal pages 200');
    return checks.join(', ');
  }

  // ── rollback (§10, accept: < 10 s) ──────────────────────────────────────

  async rollback(tenantId: string, userId: string | null, siteId: string, buildId: string): Promise<void> {
    const site = await this.prisma.withTenant(tenantId, (tx) =>
      tx.site.findFirst({
        where: { id: siteId },
        include: { template: true, server: { include: { credential: true } } },
      }),
    );
    if (!site) throw new NotFoundException('Site not found');
    const build = await this.prisma.withTenant(tenantId, (tx) =>
      tx.build.findFirst({ where: { id: buildId, siteId, status: 'success' } }),
    );
    if (!build?.artifactPath) throw new NotFoundException('Build not found or has no artifact');

    this.emit(siteId, { step: 'rollback', title: `Rolling back to build ${buildId.slice(0, 8)}`, status: 'start' });
    const session = await this.openSession(site.server);
    try {
      const ctx: InstallContext = { tenantId, userId, site, server: site.server, session };
      await this.deployArtifact(ctx, buildId, build.artifactPath);
      await this.prisma.withTenant(tenantId, (tx) =>
        tx.site.update({ where: { id: siteId }, data: { lastBuildId: buildId } }),
      );
      await this.recordEvent(tenantId, siteId, site.serverId, 'rollback', 'ok', `to build ${buildId}`);
      this.emit(siteId, { step: 'rollback', title: 'Rollback complete', status: 'done' });
    } catch (err: any) {
      await this.recordEvent(tenantId, siteId, site.serverId, 'rollback', 'fail', String(err?.message ?? err));
      this.emit(siteId, { step: 'rollback', title: 'Rollback failed', status: 'fail', detail: sanitizeForLog(String(err?.message ?? err)) });
      throw err;
    } finally {
      session.close();
    }
  }

  /**
   * Files-only rebuild + redeploy — rebuilds the template with the CURRENT
   * catalog (accumulated search cache) and atomically swaps the new release
   * in. Does NOT touch nginx or SSL, so it's safe to run on a schedule (the
   * nightly auto-rebuild) without risking Let's Encrypt rate limits. The site
   * stays live throughout.
   */
  async rebuildFiles(tenantId: string, siteId: string): Promise<string> {
    if (this.running.has(siteId)) {
      throw new Error('An install or rebuild is already running for this site');
    }
    this.running.add(siteId);
    try {
      const site = await this.prisma.withTenant(tenantId, (tx) =>
        tx.site.findFirst({
          where: { id: siteId },
          include: { template: true, server: { include: { credential: true } } },
        }),
      );
      if (!site) throw new NotFoundException('Site not found');
      const session = await this.openSession(site.server);
      try {
        const ctx: InstallContext = { tenantId, userId: null, site, server: site.server, session };
        const detail = await this.stepDeployFiles(ctx);
        await this.prisma.withTenant(tenantId, (tx) =>
          tx.site.update({
            where: { id: siteId },
            data: { lastVerifiedAt: new Date(), ...(ctx.buildId ? { lastBuildId: ctx.buildId } : {}) },
          }),
        );
        await this.recordEvent(tenantId, siteId, site.serverId, 'deploying_files', 'ok', `auto-rebuild: ${detail}`);
        return detail as string;
      } finally {
        session.close();
      }
    } finally {
      this.running.delete(siteId);
    }
  }

  /** §7.2 "Force Renew Now" — certbot renew for this site's cert. */
  async renewSsl(tenantId: string, siteId: string): Promise<{ ssl_expires_at: Date | null }> {
    const site = await this.prisma.withTenant(tenantId, (tx) =>
      tx.site.findFirst({
        where: { id: siteId },
        include: { server: { include: { credential: true } } },
      }),
    );
    if (!site) throw new NotFoundException('Site not found');
    const session = await this.openSession(site.server);
    try {
      const renew = await session.exec(
        `sudo -n certbot renew --cert-name ${site.domain} --force-renewal --non-interactive`,
        300_000,
      );
      if (renew.code !== 0) {
        await this.prisma.withTenant(tenantId, (tx) =>
          tx.site.update({ where: { id: siteId }, data: { sslStatus: 'renewal_failed' } }),
        );
        throw new Error(`certbot renew failed: ${outputTail(renew.stderr || renew.stdout)}`);
      }
      const expiry = await session.exec(
        `sudo -n openssl x509 -enddate -noout -in /etc/letsencrypt/live/${site.domain}/cert.pem`,
        30_000,
      );
      let expiresAt: Date | null = null;
      const match = expiry.stdout.match(/notAfter=(.+)/);
      if (match) {
        const parsed = new Date(match[1].trim());
        if (!Number.isNaN(parsed.getTime())) expiresAt = parsed;
      }
      await this.prisma.withTenant(tenantId, (tx) =>
        tx.site.update({
          where: { id: siteId },
          data: { sslStatus: 'active', sslExpiresAt: expiresAt },
        }),
      );
      await this.recordEvent(tenantId, siteId, site.serverId, 'renew_ssl', 'ok',
        expiresAt ? `valid until ${expiresAt.toISOString()}` : 'renewed');
      return { ssl_expires_at: expiresAt };
    } finally {
      session.close();
    }
  }

  // ── helpers ─────────────────────────────────────────────────────────────

  private async restoreLastBuild(ctx: InstallContext) {
    const last = await this.prisma.withTenant(ctx.tenantId, (tx) =>
      tx.build.findFirst({
        where: { siteId: ctx.site.id, status: 'success' },
        orderBy: { createdAt: 'desc' },
      }),
    );
    if (!last?.artifactPath) {
      throw new Error('No successful build to resume from — retry from the build step');
    }
    ctx.buildId = last.id;
    ctx.artifactKey = last.artifactPath;
    ctx.distDir = await this.builds.restoreDist(last.id, last.artifactPath);
  }

  private trackingOf(site: any) {
    return {
      ga4_id: site.ga4Id,
      meta_pixel_id: site.metaPixelId,
      google_ads_conversion_id: site.googleAdsTag?.conversion_id ?? null,
      bing_uet_tag: site.bingUetTag,
      pushvault_property_key: site.pushvaultPropertyKey,
    };
  }

  private async openSession(server: any): Promise<SshSession> {
    const plaintext = await this.vault.decrypt({
      ciphertext: Buffer.from(server.credential.ciphertext),
      dekWrapped: Buffer.from(server.credential.dekWrapped),
      iv: Buffer.from(server.credential.iv),
      authTag: Buffer.from(server.credential.authTag),
    });
    try {
      return await this.ssh.connect(
        { host: server.host, port: server.port, pinnedHostKey: server.hostKey },
        {
          username: server.sshUsername,
          ...(server.authType === 'ssh_key'
            ? { privateKey: plaintext }
            : { password: plaintext.toString('utf8') }),
        },
      );
    } finally {
      plaintext.fill(0);
    }
  }

  private evt(step: InstallStep, status: InstallEvent['status'], detail?: string): InstallEvent {
    return { step, title: STEP_TITLES[step], status, detail };
  }

  private emit(siteId: string, event: InstallEvent) {
    this.bus.publish(siteId, event);
  }

  private async fail(tenantId: string, siteId: string, serverId: string, step: string, detail: string) {
    await this.recordEvent(tenantId, siteId, serverId, step, 'fail', detail);
    await this.setInstallStatus(tenantId, siteId, 'failed');
    this.emit(siteId, {
      step, title: STEP_TITLES[step as InstallStep] ?? step, status: 'fail', detail: outputTail(detail, 800),
    });
  }

  private async setInstallStatus(tenantId: string, siteId: string, installStatus: string) {
    await this.prisma.withTenant(tenantId, (tx) =>
      tx.site.update({
        where: { id: siteId },
        data: {
          installStatus,
          ...(installStatus !== 'failed' && installStatus !== 'live' ? { status: 'building' } : {}),
        },
      }),
    );
  }

  private async recordEvent(
    tenantId: string, siteId: string, serverId: string,
    step: string, status: 'start' | 'ok' | 'fail', output = '',
  ) {
    await this.prisma.withTenant(tenantId, (tx) =>
      tx.deployEvent.create({
        data: {
          tenantId, siteId, serverId, step, status,
          commandSummary: sanitizeForLog(step).slice(0, 200),
          outputTail: output ? outputTail(output) : null,
        },
      }),
    );
  }

  private sudoHint(output: string): string {
    if (/sudo: a password is required|sudo: no tty/i.test(output)) {
      return 'The deploy user needs passwordless sudo (see server provisioning docs)';
    }
    return outputTail(output);
  }
}
