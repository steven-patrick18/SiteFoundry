-- CreateTable
CREATE TABLE "app_config" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "key" TEXT NOT NULL,
    "ciphertext" BYTEA NOT NULL,
    "dek_wrapped" BYTEA NOT NULL,
    "iv" BYTEA NOT NULL,
    "auth_tag" BYTEA NOT NULL,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "app_config_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "app_config_key_key" ON "app_config"("key");

-- Global panel config: admin identity only, never the app role.
REVOKE ALL ON TABLE "app_config" FROM sitefoundry_app;
