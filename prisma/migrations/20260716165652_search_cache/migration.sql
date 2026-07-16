-- CreateTable
CREATE TABLE "search_cache" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "engine" TEXT NOT NULL,
    "query" TEXT NOT NULL,
    "gl" TEXT NOT NULL DEFAULT 'us',
    "results" JSONB NOT NULL,
    "fetched_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "search_cache_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "search_cache_engine_query_gl_fetched_at_idx" ON "search_cache"("engine", "query", "gl", "fetched_at");

-- Public shopping data cache: admin identity only, never the app role.
REVOKE ALL ON TABLE "search_cache" FROM sitefoundry_app;
