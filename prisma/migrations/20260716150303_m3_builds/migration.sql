-- AlterTable
ALTER TABLE "sites" ADD COLUMN     "last_build_id" UUID;

-- CreateTable
CREATE TABLE "builds" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "site_id" UUID NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "log" TEXT,
    "artifact_path" TEXT,
    "duration_ms" INTEGER,
    "lighthouse_score" INTEGER,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "builds_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "builds_tenant_id_site_id_created_at_idx" ON "builds"("tenant_id", "site_id", "created_at");

-- AddForeignKey
ALTER TABLE "builds" ADD CONSTRAINT "builds_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "builds" ADD CONSTRAINT "builds_site_id_fkey" FOREIGN KEY ("site_id") REFERENCES "sites"("id") ON DELETE CASCADE ON UPDATE CASCADE;
