/**
 * M4 acceptance: a test ad-URL visit appears in the funnel attributed to its
 * campaign, and an outbound click is logged. Runs against the real dev DB
 * (partitioned visits table). Skips if the DB is unreachable.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { PrismaService } from '../src/prisma/prisma.service';
import { AnalyticsService } from '../src/analytics/analytics.service';
import { buildCampaignUtm, buildFinalUrl } from '../src/analytics/campaign-links';

const ADMIN_URL =
  process.env.DATABASE_URL ??
  'postgresql://sitefoundry:sitefoundry@localhost:55432/sitefoundry';

let dbAvailable = false;
let admin: PrismaClient;
let prisma: PrismaService;
let analytics: AnalyticsService;
let tenantId: string;
let siteId: string;

const CAMPAIGN = 'AC-Repair-Delhi-Search';

beforeAll(async () => {
  admin = new PrismaClient({ datasources: { db: { url: ADMIN_URL } } });
  try {
    await admin.$queryRaw`SELECT 1`;
    dbAvailable = true;
  } catch {
    return;
  }
  const config = {
    get: (key: string, def?: string) =>
      ({
        DATABASE_URL: ADMIN_URL,
        APP_DATABASE_URL:
          process.env.APP_DATABASE_URL ??
          'postgresql://sitefoundry_app:sitefoundry_app@localhost:55432/sitefoundry',
      })[key] ?? def,
  } as any;
  prisma = new PrismaService(config);
  analytics = new AnalyticsService(prisma);
  await analytics.onModuleInit();

  const tenant = await admin.tenant.create({ data: { name: `m4-test-${Date.now()}` } });
  tenantId = tenant.id;
  const client = await admin.client.create({ data: { tenantId, name: 'M4 Co' } });
  const cred = await admin.credential.create({
    data: {
      tenantId, kind: 'ssh_password', label: 'x',
      ciphertext: Buffer.from('x'), dekWrapped: Buffer.from('x'),
      iv: Buffer.from('x'), authTag: Buffer.from('x'),
    },
  });
  const server = await admin.server.create({
    data: {
      tenantId, name: 's', host: 'h', sshUsername: 'u',
      authType: 'password', credentialId: cred.id,
    },
  });
  const template = await admin.template.findFirst({ where: { tenantId: null } });
  const site = await admin.site.create({
    data: {
      tenantId, name: 'm4-analytics', clientId: client.id, serverId: server.id,
      templateId: template!.id, domain: `m4-${Date.now()}.analytics.example`,
      destinationUrl: 'https://store.m4.example', params: {},
    },
  });
  siteId = site.id;
});

afterAll(async () => {
  if (!dbAvailable) return;
  await admin.$executeRaw`DELETE FROM visits WHERE tenant_id = ${tenantId}::uuid`;
  await admin.site.deleteMany({ where: { tenantId } });
  await admin.client.deleteMany({ where: { tenantId } });
  await admin.server.deleteMany({ where: { tenantId } });
  await admin.credential.deleteMany({ where: { tenantId } });
  await admin.tenant.delete({ where: { id: tenantId } });
  await admin.$disconnect();
  await prisma.onModuleDestroy();
});

describe('first-party analytics (§11)', () => {
  it('ad-URL visit lands in the funnel attributed to the campaign', async (ctx) => {
    if (!dbAvailable) return ctx.skip();

    // simulate the visitor journey a campaign link produces
    const utm = buildCampaignUtm('google', CAMPAIGN);
    const finalUrl = buildFinalUrl('m4.analytics.example', utm);
    expect(finalUrl).toContain(`utm_campaign=${CAMPAIGN}`);

    const session = 'sf_test_session_1';
    const visit = (event: string, meta?: unknown) =>
      analytics.recordVisit({
        tenantId, siteId, event, sessionId: session,
        utm: { source: utm.source, medium: utm.medium, campaign: utm.campaign },
        path: '/', meta,
      });
    await visit('pageview');
    await visit('cta_click');
    await visit('outbound_click', {
      product: 'ArcticPro 1.5T',
      target_url: 'https://store.m4.example/products/arcticpro?utm_source=google&utm_medium=cpc&utm_campaign=' + CAMPAIGN,
    });

    const funnel = await analytics.funnel(tenantId, siteId, { utm_campaign: CAMPAIGN });
    const steps = Object.fromEntries(funnel.steps.map((s) => [s.event, s.count]));
    expect(steps.pageview).toBe(1);
    expect(steps.cta_click).toBe(1);
    expect(steps.outbound_click).toBe(1);
    expect(steps.lead_submit).toBe(0);

    // a different campaign filter excludes these visits
    const other = await analytics.funnel(tenantId, siteId, { utm_campaign: 'Other-Campaign' });
    expect(other.steps.find((s) => s.event === 'pageview')!.count).toBe(0);
  });

  it('outbound click carries UTM passthrough target in meta', async (ctx) => {
    if (!dbAvailable) return ctx.skip();
    const row = await admin.$queryRaw<Array<{ meta: any }>>`
      SELECT meta FROM visits
      WHERE tenant_id = ${tenantId}::uuid AND event = 'outbound_click'
      ORDER BY ts DESC LIMIT 1`;
    expect(row[0].meta.target_url).toContain('utm_campaign=' + CAMPAIGN);
    expect(row[0].meta.target_url).toContain('store.m4.example');
  });

  it('stats aggregates by day and campaign', async (ctx) => {
    if (!dbAvailable) return ctx.skip();
    const stats = await analytics.stats(tenantId, siteId, {});
    expect(stats.series.length).toBeGreaterThan(0);
    const campaign = stats.top_campaigns.find((c) => c.utm_campaign === CAMPAIGN);
    expect(campaign?.visits).toBe(1);
    expect(campaign?.outbound).toBe(1);
  });

  it('RLS: another tenant sees an empty funnel', async (ctx) => {
    if (!dbAvailable) return ctx.skip();
    const other = await admin.tenant.create({ data: { name: `m4-other-${Date.now()}` } });
    try {
      const funnel = await analytics.funnel(other.id, siteId, {});
      expect(funnel.steps.every((s) => s.count === 0)).toBe(true);
    } finally {
      await admin.tenant.delete({ where: { id: other.id } });
    }
  });
});
