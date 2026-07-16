-- CreateTable
CREATE TABLE "campaign_links" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "site_id" UUID NOT NULL,
    "platform" TEXT NOT NULL,
    "campaign_name" TEXT NOT NULL,
    "utm" JSONB NOT NULL,
    "final_url" TEXT NOT NULL,
    "external_campaign_id" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "campaign_links_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "campaign_links_tenant_id_site_id_idx" ON "campaign_links"("tenant_id", "site_id");

-- AddForeignKey
ALTER TABLE "campaign_links" ADD CONSTRAINT "campaign_links_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign_links" ADD CONSTRAINT "campaign_links_site_id_fkey" FOREIGN KEY ("site_id") REFERENCES "sites"("id") ON DELETE CASCADE ON UPDATE CASCADE;
