-- Per-site content editing key (client self-service inline editor).
ALTER TABLE "sites" ADD COLUMN IF NOT EXISTS "content_edit_key" text;
