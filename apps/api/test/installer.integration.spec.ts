/**
 * Full install pipeline against the real dev database and a REAL astro build
 * of the stock template — with SSH simulated by a fake session that records
 * every command. Covers the M3 acceptance criteria that don't need physical
 * hardware: step order + SSE events, deploy_events, failure -> retry from
 * the failed step, and rollback via artifact swap.
 *
 * Requires the local dev DB (pnpm db:dev). Skips if unreachable.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { PrismaService } from '../src/prisma/prisma.service';
import { VaultService } from '../src/vault/vault.service';
import { LocalDevKmsProvider } from '../src/vault/kms.provider';
import { StorageService } from '../src/storage/storage.service';
import { BuildService } from '../src/builds/build.service';
import { ProgressBus, InstallEvent } from '../src/jobs/progress-bus';
import { InstallerService } from '../src/installer/installer.service';
import { SshSession } from '../src/servers/ssh.service';

const ADMIN_URL =
  process.env.DATABASE_URL ??
  'postgresql://sitefoundry:sitefoundry@localhost:55432/sitefoundry';
const REPO_ROOT = resolve(__dirname, '..', '..', '..');

class FakeConfig {
  private readonly values: Record<string, string>;
  constructor(values: Record<string, string>) {
    this.values = values;
  }
  get<T = string>(key: string, def?: T): T {
    return (this.values[key] as unknown as T) ?? (def as T);
  }
}

/** Records commands; fails any command matching `failPattern` once. */
class FakeSshSession implements SshSession {
  commands: string[] = [];
  uploads: Array<{ local: string; remote: string }> = [];
  failPattern: RegExp | null = null;
  hostKey = 'SHA256:fake';
  async exec(command: string) {
    this.commands.push(command);
    if (this.failPattern?.test(command)) {
      this.failPattern = null; // fail once, succeed on retry
      return { code: 1, stdout: '', stderr: 'nginx: [emerg] simulated broken config' };
    }
    if (/openssl x509 -enddate/.test(command)) {
      return { code: 0, stdout: 'notAfter=Oct 14 12:00:00 2026 GMT\n', stderr: '' };
    }
    return { code: 0, stdout: '', stderr: '' };
  }
  async uploadFile(local: string, remote: string) {
    this.uploads.push({ local, remote });
  }
  close() {}
}

let dbAvailable = false;
let admin: PrismaClient;
let prisma: PrismaService;
let installer: InstallerService;
let bus: ProgressBus;
let storage: StorageService;
let session: FakeSshSession;
let tenantId: string;
let siteId: string;

const events: InstallEvent[] = [];

const GOOD_PARAMS = {
  brand: { business_name: 'PipeTest Co', primary_color: '#123456', secondary_color: '#22c55e', font: 'Inter' },
  seo: { page_title: 'Pipeline test page', meta_description: 'Install pipeline integration test.' },
  hero: { headline: 'Pipeline works', subheadline: 'Streaming steps', cta_text: 'Go Store' },
  products: [
    { title: 'Widget One', price: '$19', bullets: ['Tested'], target_url: 'https://shop.pipetest.example/w1' },
  ],
  trust: { business_name: 'PipeTest Co', contact_email: 'ops@pipetest.example', contact_phone: '+1-555', address: '1 Test Way' },
  legal: {
    privacy_policy_md: 'P'.repeat(120),
    terms_md: 'Terms.',
    affiliate_disclosure_md: 'We may earn a commission.',
  },
  ad_claims: ['Ships in 24 hours'],
};

beforeAll(async () => {
  admin = new PrismaClient({ datasources: { db: { url: ADMIN_URL } } });
  try {
    await admin.$queryRaw`SELECT 1`;
    dbAvailable = true;
  } catch {
    return;
  }

  const env = {
    DATABASE_URL: ADMIN_URL,
    APP_DATABASE_URL:
      process.env.APP_DATABASE_URL ??
      'postgresql://sitefoundry_app:sitefoundry_app@localhost:55432/sitefoundry',
    STORAGE_DIR: join(REPO_ROOT, '.local', 'test-storage'),
    BUILD_WORK_DIR: join(REPO_ROOT, '.local', 'test-builds'),
    TEMPLATES_DIR: join(REPO_ROOT, 'templates'),
    SKIP_SSL: 'true',
  };
  const config = new FakeConfig(env) as any;

  prisma = new PrismaService(config);
  const vault = new VaultService(new LocalDevKmsProvider(randomBytes(32)));
  storage = new StorageService(config);
  const builds = new BuildService(config, storage);
  bus = new ProgressBus();
  session = new FakeSshSession();
  const fakeSsh = { connect: async () => session } as any;
  installer = new InstallerService(prisma, vault, fakeSsh, builds, bus, config);

  // seed fixture rows (owner client bypasses RLS)
  const tenant = await admin.tenant.create({ data: { name: `m3-test-${Date.now()}` } });
  tenantId = tenant.id;
  const enc = await vault.encrypt(Buffer.from('fake-password'));
  const credential = await admin.credential.create({
    data: {
      tenantId, kind: 'ssh_password', label: 'm3-test',
      ciphertext: enc.ciphertext, dekWrapped: enc.dekWrapped, iv: enc.iv, authTag: enc.authTag,
    },
  });
  const server = await admin.server.create({
    data: {
      tenantId, name: 'm3-fake-server', host: '203.0.113.99',
      sshUsername: 'deploy', authType: 'password', credentialId: credential.id,
      status: 'ready', baseProvisioned: true,
    },
  });
  const client = await admin.client.create({ data: { tenantId, name: 'PipeTest Co' } });
  const template = await admin.template.findFirst({ where: { tenantId: null, category: 'ecom_showcase' } });
  const site = await admin.site.create({
    data: {
      tenantId, name: 'pipeline-test', clientId: client.id, serverId: server.id,
      templateId: template!.id, domain: `m3-${Date.now()}.pipetest.example`,
      destinationUrl: 'https://shop.pipetest.example',
      params: GOOD_PARAMS as any,
      ga4Id: 'G-TEST123456', metaPixelId: '111222333444555',
      pushvaultPropertyKey: 'pk_live_m3test',
    },
  });
  siteId = site.id;

  bus.subscribe(siteId, (e) => events.push(e));

  // final-verify fetch is served from the built dist instead of the network
  const realFetch = global.fetch;
  global.fetch = (async (input: any, init?: any) => {
    const url = String(input);
    if (url.includes('pipetest.example')) {
      const path = new URL(url).pathname;
      const rel = path === '/' ? 'index.html' : `${path.replace(/^\/|\/$/g, '')}/index.html`;
      const build = await admin.build.findFirst({ where: { siteId, status: 'success' }, orderBy: { createdAt: 'desc' } });
      try {
        const html = await readFile(join(env.BUILD_WORK_DIR, build!.id, 'dist', rel), 'utf8');
        return new Response(html, { status: 200 });
      } catch {
        return new Response('not found', { status: 404 });
      }
    }
    return realFetch(input, init);
  }) as any;
}, 60_000);

afterAll(async () => {
  if (!dbAvailable) return;
  await admin.deployEvent.deleteMany({ where: { tenantId } });
  await admin.build.deleteMany({ where: { tenantId } });
  await admin.site.deleteMany({ where: { tenantId } });
  await admin.client.deleteMany({ where: { tenantId } });
  await admin.server.deleteMany({ where: { tenantId } });
  await admin.credential.deleteMany({ where: { tenantId } });
  await admin.auditLog.deleteMany({ where: { tenantId } });
  await admin.tenant.delete({ where: { id: tenantId } });
  await admin.$disconnect();
  await prisma.onModuleDestroy();
});

describe('install pipeline (simulated server, real build)', () => {
  it('runs the full state machine to live', async (ctx) => {
    if (!dbAvailable) return ctx.skip();
    await installer.run(tenantId, null, siteId, 'preflight');

    const site = await admin.site.findUnique({ where: { id: siteId } });
    expect(site!.installStatus).toBe('live');
    expect(site!.status).toBe('published');
    expect(site!.publishedAt).toBeTruthy();
    expect(site!.siteSystemUser).toMatch(/^site_[0-9a-f]{8}$/);
    expect(site!.documentRoot).toBe(`/home/${site!.siteSystemUser}/public`);
    expect(site!.lastBuildId).toBeTruthy();

    // SSE event order
    const okSteps = events.filter((e) => e.status === 'ok' || e.status === 'done' || e.status === 'skipped').map((e) => e.step);
    expect(okSteps).toEqual([
      'preflight', 'creating_user', 'deploying_files', 'configuring_nginx',
      'issuing_ssl', 'injecting_tracking', 'verifying', 'live',
    ]);

    // server-side commands: isolated user, atomic swap, nginx test+reload, no certbot (SKIP_SSL)
    const joined = session.commands.join('\n');
    expect(joined).toContain(`useradd -m -s /bin/bash ${site!.siteSystemUser}`);
    expect(joined).toContain('chmod 750');
    expect(joined).toContain('unzip -q /tmp/sf-');
    expect(joined).toContain('nginx -t');
    expect(joined).toContain('systemctl reload nginx');
    expect(joined).not.toContain('certbot');
    expect(session.uploads.length).toBeGreaterThan(0);

    // build artifact stored + real astro output verified
    const build = await admin.build.findUnique({ where: { id: site!.lastBuildId! } });
    expect(build!.status).toBe('success');
    const artifact = await storage.get(build!.artifactPath!);
    expect(artifact.length).toBeGreaterThan(1000);

    // deploy events recorded per step
    const stepEvents = await admin.deployEvent.findMany({ where: { siteId } });
    expect(stepEvents.filter((e) => e.status === 'ok').length).toBeGreaterThanOrEqual(6);
  }, 120_000);

  it('failure surfaces output tail and retry resumes from failed step', async (ctx) => {
    if (!dbAvailable) return ctx.skip();
    events.length = 0;
    session.commands.length = 0;
    session.failPattern = /nginx -t/;

    await installer.run(tenantId, null, siteId, 'configuring_nginx');
    let site = await admin.site.findUnique({ where: { id: siteId } });
    expect(site!.installStatus).toBe('failed');
    const failEvent = events.find((e) => e.status === 'fail');
    expect(failEvent?.step).toBe('configuring_nginx');
    expect(failEvent?.detail).toContain('simulated broken config');

    // retry from the failed step (§9 "Retry from step N")
    events.length = 0;
    await installer.run(tenantId, null, siteId, 'configuring_nginx');
    site = await admin.site.findUnique({ where: { id: siteId } });
    expect(site!.installStatus).toBe('live');
    const okSteps = events.filter((e) => ['ok', 'skipped', 'done'].includes(e.status)).map((e) => e.step);
    expect(okSteps).toEqual(['configuring_nginx', 'issuing_ssl', 'injecting_tracking', 'verifying', 'live']);
  }, 120_000);

  it('force-SSL-renew runs certbot and updates ssl_expires_at (M5 acceptance)', async (ctx) => {
    if (!dbAvailable) return ctx.skip();
    session.commands.length = 0;
    const result = await installer.renewSsl(tenantId, siteId);
    expect(result.ssl_expires_at?.toISOString()).toBe('2026-10-14T12:00:00.000Z');

    const joined = session.commands.join('\n');
    expect(joined).toContain('certbot renew --cert-name');
    expect(joined).toContain('--force-renewal');

    const site = await admin.site.findUnique({ where: { id: siteId } });
    expect(site!.sslStatus).toBe('active');
    expect(site!.sslExpiresAt?.toISOString()).toBe('2026-10-14T12:00:00.000Z');
  }, 60_000);

  it('rollback swaps a previous build artifact onto the server', async (ctx) => {
    if (!dbAvailable) return ctx.skip();
    const firstBuild = (await admin.build.findFirst({
      where: { siteId, status: 'success' }, orderBy: { createdAt: 'asc' },
    }))!;

    // make a second build by rebuilding
    await installer.run(tenantId, null, siteId, 'deploying_files');
    const site = await admin.site.findUnique({ where: { id: siteId } });
    expect(site!.lastBuildId).not.toBe(firstBuild.id);

    session.commands.length = 0;
    const started = Date.now();
    await installer.rollback(tenantId, null, siteId, firstBuild.id);
    const elapsed = Date.now() - started;

    const after = await admin.site.findUnique({ where: { id: siteId } });
    expect(after!.lastBuildId).toBe(firstBuild.id);
    const joined = session.commands.join('\n');
    expect(joined).toContain(`unzip -q /tmp/sf-${firstBuild.id}`);
    expect(joined).toContain(`mv /home/${after!.siteSystemUser}/releases/${firstBuild.id} /home/${after!.siteSystemUser}/public`);
    // simulated transport: asserts the swap command count is small/atomic, not network time
    expect(elapsed).toBeLessThan(10_000);
  }, 120_000);
});
