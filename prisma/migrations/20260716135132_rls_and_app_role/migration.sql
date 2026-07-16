-- Tenant isolation via Row-Level Security (sections 1, 3, 13 of the build doc).
--
-- Every tenant-scoped table gets ENABLE + FORCE ROW LEVEL SECURITY and a
-- tenant_isolation policy keyed on current_setting('app.tenant_id'). FORCE
-- means even the table owner is subject to the policies; only superusers or
-- BYPASSRLS roles can see across tenants.
--
-- The API connects as the restricted role `sitefoundry_app` (no bypass).
-- The owner/migration role (DATABASE_URL) is used only for migrations, seed,
-- and the pre-auth login lookup.

-- Restricted application role -----------------------------------------------
DO $$
BEGIN
  CREATE ROLE sitefoundry_app LOGIN PASSWORD 'sitefoundry_app';
EXCEPTION WHEN duplicate_object THEN
  NULL;
END
$$;

GRANT USAGE ON SCHEMA public TO sitefoundry_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO sitefoundry_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO sitefoundry_app;

-- Prisma's migration bookkeeping table must never be touched by the app role.
-- (guarded: the table does not exist in Prisma's shadow database)
DO $$
BEGIN
  IF to_regclass('public._prisma_migrations') IS NOT NULL THEN
    REVOKE ALL ON TABLE "_prisma_migrations" FROM sitefoundry_app;
  END IF;
END
$$;

-- RLS: tables keyed on tenant_id ---------------------------------------------
-- current_setting(..., true) returns NULL when unset -> no rows match, so a
-- connection that forgot to set tenant context reads/writes nothing.

ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "users" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "users"
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);

ALTER TABLE "credentials" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "credentials" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "credentials"
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);

ALTER TABLE "servers" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "servers" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "servers"
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);

ALTER TABLE "deploy_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "deploy_events" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "deploy_events"
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);

ALTER TABLE "audit_log" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "audit_log" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "audit_log"
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);

-- RLS: the tenants table itself (keyed on id) ---------------------------------
ALTER TABLE "tenants" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "tenants" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "tenants"
  USING (id = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK (id = current_setting('app.tenant_id', true)::uuid);
