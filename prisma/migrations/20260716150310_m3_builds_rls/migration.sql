-- RLS for builds (immutable per-site build artifacts).
ALTER TABLE "builds" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "builds" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "builds"
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);
