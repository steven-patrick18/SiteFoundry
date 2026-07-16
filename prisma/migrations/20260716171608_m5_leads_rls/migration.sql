-- Consent is mandatory at the database level too (section 13).
ALTER TABLE "leads" ADD CONSTRAINT leads_consent_required CHECK (consent = true);

ALTER TABLE "leads" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "leads" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "leads"
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);

-- Public shopping data cache: admin identity only, never the app role
-- (moved here from the search_cache migration, which was already applied).
REVOKE ALL ON TABLE "search_cache" FROM sitefoundry_app;
