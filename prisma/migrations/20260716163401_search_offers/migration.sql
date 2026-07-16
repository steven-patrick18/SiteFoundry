-- Multi-store comparison + on-site search support.

-- Extra outbound store hosts allowed by the compliance gate (section 8).
ALTER TABLE "sites" ADD COLUMN "extra_allowed_hosts" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

-- New analytics event: on-site product search (query kept in meta).
ALTER TABLE "visits" DROP CONSTRAINT IF EXISTS "visits_event_check";
ALTER TABLE "visits" ADD CONSTRAINT "visits_event_check" CHECK (event IN (
  'pageview','search','cta_click','outbound_click',
  'push_prompt_shown','push_subscribed','lead_submit'));
