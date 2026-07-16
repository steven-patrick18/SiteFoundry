-- First-party analytics: visits, partitioned by month on ts (section 3).
-- Managed with raw SQL (Prisma does not handle partitioned tables).

CREATE TABLE "visits" (
  id            uuid NOT NULL DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL,
  site_id       uuid NOT NULL,
  ts            timestamptz NOT NULL DEFAULT now(),
  session_id    text,
  utm_source    text,
  utm_medium    text,
  utm_campaign  text,
  utm_content   text,
  utm_term      text,
  referrer      text,
  path          text,
  country       char(2),
  device        text,
  browser       text,
  event         text NOT NULL CHECK (event IN (
    'pageview','cta_click','outbound_click',
    'push_prompt_shown','push_subscribed','lead_submit')),
  meta          jsonb,
  PRIMARY KEY (id, ts)
) PARTITION BY RANGE (ts);

CREATE INDEX visits_site_campaign_ts ON "visits" (site_id, utm_campaign, ts);
CREATE INDEX visits_tenant_site_ts   ON "visits" (tenant_id, site_id, ts);

-- Creates the partition for a given month if missing. Called for the current
-- and next month at API boot (analytics.service.ts) - cheap and idempotent.
CREATE OR REPLACE FUNCTION ensure_visits_partition(month_start date)
RETURNS void AS $$
DECLARE
  part_name text := 'visits_' || to_char(month_start, 'YYYY_MM');
  from_ts   timestamptz := month_start;
  to_ts     timestamptz := month_start + interval '1 month';
BEGIN
  IF to_regclass('public.' || part_name) IS NULL THEN
    EXECUTE format(
      'CREATE TABLE %I PARTITION OF "visits" FOR VALUES FROM (%L) TO (%L)',
      part_name, from_ts, to_ts
    );
  END IF;
END;
$$ LANGUAGE plpgsql;

SELECT ensure_visits_partition(date_trunc('month', now())::date);
SELECT ensure_visits_partition((date_trunc('month', now()) + interval '1 month')::date);

-- RLS: reads are tenant-scoped; inserts come from /public/track via the
-- owner role (no tenant JWT on public endpoints), so only app-role access
-- is policy-limited.
ALTER TABLE "visits" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "visits" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "visits"
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);

GRANT SELECT, INSERT ON "visits" TO sitefoundry_app;

-- RLS for campaign_links
ALTER TABLE "campaign_links" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "campaign_links" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "campaign_links"
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);
