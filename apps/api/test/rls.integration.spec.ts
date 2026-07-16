/**
 * Proves cross-tenant isolation (§13): the restricted app role, with RLS
 * forced, can only see rows for the tenant pinned in app.tenant_id — and
 * sees nothing when no tenant is set.
 *
 * Requires the local dev database (pnpm db:dev). Skips if unreachable.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Client } from 'pg';

const ADMIN_URL =
  process.env.DATABASE_URL ??
  'postgresql://sitefoundry:sitefoundry@localhost:55432/sitefoundry';
const APP_URL =
  process.env.APP_DATABASE_URL ??
  'postgresql://sitefoundry_app:sitefoundry_app@localhost:55432/sitefoundry';

let admin: Client;
let dbAvailable = false;
let tenantA: string;
let tenantB: string;

beforeAll(async () => {
  admin = new Client({ connectionString: ADMIN_URL, connectionTimeoutMillis: 2000 });
  try {
    await admin.connect();
    dbAvailable = true;
  } catch {
    return; // tests will be skipped
  }
  const a = await admin.query(
    `INSERT INTO tenants (name) VALUES ('rls-test-a') RETURNING id`,
  );
  const b = await admin.query(
    `INSERT INTO tenants (name) VALUES ('rls-test-b') RETURNING id`,
  );
  tenantA = a.rows[0].id;
  tenantB = b.rows[0].id;
  await admin.query(
    `INSERT INTO users (tenant_id, email, password_hash, role)
     VALUES ($1, 'a@rls.test', 'x', 'admin'), ($2, 'b@rls.test', 'x', 'admin')`,
    [tenantA, tenantB],
  );
});

afterAll(async () => {
  if (dbAvailable) {
    await admin.query(`DELETE FROM users WHERE email LIKE '%@rls.test'`);
    await admin.query(`DELETE FROM tenants WHERE name LIKE 'rls-test-%'`);
    await admin.end();
  }
});

async function asTenant<T>(
  tenantId: string | null,
  fn: (c: Client) => Promise<T>,
): Promise<T> {
  const c = new Client({ connectionString: APP_URL });
  await c.connect();
  try {
    if (tenantId) {
      await c.query(`SELECT set_config('app.tenant_id', $1, false)`, [tenantId]);
    }
    return await fn(c);
  } finally {
    await c.end();
  }
}

describe('Row-Level Security tenant isolation', () => {
  it('app role sees only its own tenant rows', async (ctx) => {
    if (!dbAvailable) return ctx.skip();
    const rows = await asTenant(tenantA, async (c) =>
      (await c.query(`SELECT email FROM users WHERE email LIKE '%@rls.test'`)).rows,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].email).toBe('a@rls.test');
  });

  it('cross-tenant query returns 0 rows', async (ctx) => {
    if (!dbAvailable) return ctx.skip();
    const rows = await asTenant(tenantA, async (c) =>
      (await c.query(`SELECT * FROM users WHERE email = 'b@rls.test'`)).rows,
    );
    expect(rows).toHaveLength(0);
  });

  it('no tenant context -> zero rows on every tenant table', async (ctx) => {
    if (!dbAvailable) return ctx.skip();
    await asTenant(null, async (c) => {
      for (const table of ['tenants', 'users', 'credentials', 'servers', 'deploy_events', 'audit_log']) {
        const r = await c.query(`SELECT count(*)::int AS n FROM ${table}`);
        expect(r.rows[0].n).toBe(0);
      }
    });
  });

  it('cannot UPDATE another tenant\'s rows', async (ctx) => {
    if (!dbAvailable) return ctx.skip();
    const updated = await asTenant(tenantA, async (c) =>
      (await c.query(`UPDATE users SET role = 'viewer' WHERE email = 'b@rls.test'`)).rowCount,
    );
    expect(updated).toBe(0);
  });

  it('cannot INSERT rows for another tenant (WITH CHECK)', async (ctx) => {
    if (!dbAvailable) return ctx.skip();
    await expect(
      asTenant(tenantA, (c) =>
        c.query(
          `INSERT INTO users (tenant_id, email, password_hash, role)
           VALUES ($1, 'evil@rls.test', 'x', 'admin')`,
          [tenantB],
        ),
      ),
    ).rejects.toThrow(/row-level security/i);
  });

  it('app role cannot bypass RLS or read _prisma_migrations', async (ctx) => {
    if (!dbAvailable) return ctx.skip();
    await asTenant(null, async (c) => {
      const attrs = await c.query(
        `SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = 'sitefoundry_app'`,
      );
      expect(attrs.rows[0].rolsuper).toBe(false);
      expect(attrs.rows[0].rolbypassrls).toBe(false);
      await expect(c.query(`SELECT * FROM _prisma_migrations`)).rejects.toThrow(
        /permission denied/i,
      );
    });
  });
});
