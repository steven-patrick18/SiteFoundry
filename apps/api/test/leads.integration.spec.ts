/**
 * M5 acceptance: consented lead capture -> webhook delivers JSON with UTMs
 * and consent; consent is mandatory; raw IPs are never stored; CSV export
 * is audit-logged. Runs against the dev DB and a real local HTTP webhook
 * receiver. Skips if the DB is unreachable.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createServer, Server } from 'node:http';
import { PrismaClient } from '@prisma/client';
import { PrismaService } from '../src/prisma/prisma.service';
import { LeadsService } from '../src/leads/leads.service';
import { AuthUser } from '../src/auth/current-user.decorator';

const ADMIN_URL =
  process.env.DATABASE_URL ??
  'postgresql://sitefoundry:sitefoundry@localhost:55432/sitefoundry';

let dbAvailable = false;
let admin: PrismaClient;
let prisma: PrismaService;
let leads: LeadsService;
let tenantId: string;
let siteId: string;
let user: AuthUser;
let webhookServer: Server;
let webhookPort: number;
const received: any[] = [];

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
        LEAD_IP_SALT: 'test-salt',
        NODE_ENV: 'development',
      })[key] ?? def,
  } as any;
  prisma = new PrismaService(config);
  leads = new LeadsService(prisma, config);

  const tenant = await admin.tenant.create({ data: { name: `m5-test-${Date.now()}` } });
  tenantId = tenant.id;
  const client = await admin.client.create({ data: { tenantId, name: 'M5 Co' } });
  const cred = await admin.credential.create({
    data: {
      tenantId, kind: 'ssh_password', label: 'x',
      ciphertext: Buffer.from('x'), dekWrapped: Buffer.from('x'),
      iv: Buffer.from('x'), authTag: Buffer.from('x'),
    },
  });
  const server = await admin.server.create({
    data: { tenantId, name: 's', host: 'h', sshUsername: 'u', authType: 'password', credentialId: cred.id },
  });
  const template = await admin.template.findFirst({ where: { tenantId: null, category: 'lead_page' } });
  const site = await admin.site.create({
    data: {
      tenantId, name: 'm5-leads', clientId: client.id, serverId: server.id,
      templateId: template!.id, domain: `m5-${Date.now()}.leads.example`,
      destinationUrl: 'https://store.m5.example', params: {},
    },
  });
  siteId = site.id;

  const dbUser = await admin.user.create({
    data: { tenantId, email: `m5-${Date.now()}@test.local`, passwordHash: 'x', role: 'admin' },
  });
  user = { userId: dbUser.id, tenantId, email: dbUser.email, role: 'admin' };

  // local webhook receiver
  webhookServer = createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      received.push(JSON.parse(body));
      res.writeHead(200).end('ok');
    });
  });
  await new Promise<void>((resolve) => webhookServer.listen(0, '127.0.0.1', resolve));
  webhookPort = (webhookServer.address() as any).port;
});

afterAll(async () => {
  if (!dbAvailable) return;
  webhookServer?.close();
  await admin.lead.deleteMany({ where: { tenantId } });
  await admin.auditLog.deleteMany({ where: { tenantId } });
  await admin.site.deleteMany({ where: { tenantId } });
  await admin.client.deleteMany({ where: { tenantId } });
  await admin.server.deleteMany({ where: { tenantId } });
  await admin.credential.deleteMany({ where: { tenantId } });
  await admin.user.deleteMany({ where: { tenantId } });
  await admin.tenant.delete({ where: { id: tenantId } });
  await admin.$disconnect();
  await prisma.onModuleDestroy();
});

describe('consented lead capture (§10, §13)', () => {
  it('rejects submissions without consent', async (ctx) => {
    if (!dbAvailable) return ctx.skip();
    await expect(
      leads.capture({ siteKey: siteId, fields: { name: 'X' }, consent: false }),
    ).rejects.toThrow(/consent/i);
    await expect(
      leads.capture({ siteKey: siteId, fields: { name: 'X' }, consent: 'yes' as any }),
    ).rejects.toThrow(/consent/i);
    expect(await admin.lead.count({ where: { tenantId } })).toBe(0);
  });

  it('stores a consented lead with hashed IP and delivers the webhook with UTMs', async (ctx) => {
    if (!dbAvailable) return ctx.skip();
    await leads.setWebhook(user, siteId, `http://127.0.0.1:${webhookPort}/leads`);
    await leads.capture({
      siteKey: siteId,
      fields: { name: 'Ada Lovelace', email: 'ada@example.com', phone: '+1 555 0100' },
      consent: true,
      utm: { source: 'google', medium: 'cpc', campaign: 'M5-Test-Campaign' },
      ip: '203.0.113.7',
    });

    const lead = await admin.lead.findFirstOrThrow({ where: { tenantId } });
    expect(lead.consent).toBe(true);
    expect((lead.fields as any).email).toBe('ada@example.com');
    expect(lead.ipHash).toMatch(/^[0-9a-f]{64}$/);
    expect(lead.ipHash).not.toContain('203.0.113.7');
    expect((lead.sourceUtm as any).campaign).toBe('M5-Test-Campaign');

    // webhook is fire-and-forget — give it a moment
    await new Promise((r) => setTimeout(r, 500));
    expect(received).toHaveLength(1);
    expect(received[0].lead.fields.name).toBe('Ada Lovelace');
    expect(received[0].lead.consent).toBe(true);
    expect(received[0].lead.source_utm.campaign).toBe('M5-Test-Campaign');
    expect(received[0].site.id).toBe(siteId);
  });

  it('test-send delivers a sample payload', async (ctx) => {
    if (!dbAvailable) return ctx.skip();
    const result = await leads.testWebhook(user, siteId);
    expect(result.delivered).toBe(true);
  });

  it('CSV export contains the lead and is audit-logged', async (ctx) => {
    if (!dbAvailable) return ctx.skip();
    const csv = await leads.exportCsv(user, siteId);
    expect(csv).toContain('Ada Lovelace');
    expect(csv).toContain('M5-Test-Campaign');
    expect(csv.split('\r\n')[0]).toContain('submitted_at');
    const audit = await admin.auditLog.findFirst({
      where: { tenantId, action: 'leads.export' },
    });
    expect(audit).toBeTruthy();
  });

  it('database CHECK blocks consent=false even at the SQL level', async (ctx) => {
    if (!dbAvailable) return ctx.skip();
    await expect(
      admin.$executeRaw`INSERT INTO leads (tenant_id, site_id, fields, consent)
        VALUES (${tenantId}::uuid, ${siteId}::uuid, '{}'::jsonb, false)`,
    ).rejects.toThrow(/leads_consent_required/);
  });
});
