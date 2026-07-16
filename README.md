# SiteFoundry

Server-connected landing site deployment platform — a multi-tenant control
panel that SSHes into client/agency servers, stores credentials in an
encrypted vault, provisions Astro landing sites with nginx + HTTPS, and keeps
a full operations record per client, site, server, domain, SSL cert, and ad
campaign.

Spec: `SiteFoundry Developer Build Doc v3 Final.docx` (v3.0, in repo root).
Built milestone by milestone (§14 of the doc). **Current state: Milestones
M1 + M2 + M3 complete** — credential vault (envelope encryption), multi-tenant
schema with Postgres RLS, JWT auth, server management (SSH test, facts probe,
host-key pinning, streamed base provisioning), client CRUD, template library
with a real buildable Astro stock template, schema-driven parameter forms,
the pre-flight compliance gate (§8), and the full §9 install pipeline:
Astro build → immutable artifact → SFTP deploy with atomic swap → nginx
vhost → certbot SSL → tracking/claims verification → live, streamed over
SSE with retry-from-step and sub-10s rollback. Real-hardware acceptance
(deploy to an actual Ubuntu VPS) runs when the production server is bought.
Next: M4 site record + first-party analytics.

## Stack (fixed by spec §2)

| Layer | Choice |
|---|---|
| API | Node.js 20 + NestJS + TypeScript (`apps/api`) |
| Dashboard | React + Vite + TypeScript (`apps/dashboard`) |
| Database | PostgreSQL 15 (partitioned, RLS) via Prisma |
| Jobs | Redis 7 + BullMQ (worker entrypoint in `apps/api/src/worker.ts`) |
| Vault | AES-256-GCM envelope encryption + KMS (LocalStack in dev) |
| SSH | ssh2 |
| Templates | Astro static builds |
| Storage | S3 (MinIO in dev) |

## Prerequisites

- Node >= 20, pnpm >= 9
- **Docker Desktop** — required for local Postgres/Redis/MinIO/LocalStack.
  Not yet installed on this machine; the API runs without it but reports its
  database/redis dependencies as `unavailable`.

## Quickstart — no Docker (current dev setup on this machine)

```bash
pnpm install
# .env is already set up for the embedded DB (port 55432; 5432 is in a
# Windows-reserved range here). KMS_PROVIDER=local-dev needs no infra.

pnpm db:dev                # terminal 1: embedded Postgres 17 (data in .local/)
pnpm prisma migrate dev    # terminal 2: apply migrations
pnpm seed                  # creates tenant + admin@sitefoundry.local / admin12345
pnpm dev                   # API :3000 + dashboard :5173
```

Sign in at http://localhost:5173 with `admin@sitefoundry.local` / `admin12345`.

## Quickstart — with Docker (§15, production-parity)

```bash
# 1. Infrastructure
docker compose up -d          # postgres 15, redis, minio, localstack

# 2. Create the mock KMS master key (needs awslocal or aws --endpoint-url)
awslocal kms create-key --description "sitefoundry-dev-master"
# put KeyMetadata.KeyId into .env as KMS_MASTER_KEY_ID and set KMS_PROVIDER=aws

# 3. Install + configure
pnpm install
cp .env.example .env       # point DATABASE_URL at :5432

# 4. Database
pnpm prisma migrate dev
pnpm seed

# 5. Run
pnpm dev        # API http://localhost:3000/api/v1  +  dashboard http://localhost:5173
pnpm worker     # deploy/build worker (separate terminal)
```

Health check: `GET http://localhost:3000/api/v1/health`
Tests: `pnpm --filter @sitefoundry/api test` (vault crypto + RLS isolation —
the RLS suite needs the dev database running)

## Repo layout

```
apps/api          NestJS API (port 3000) + BullMQ worker entrypoint
apps/dashboard    React + Vite dashboard (port 5173, proxies /api → :3000)
packages/shared   Shared TS types/constants
prisma/           Prisma schema + seed (models land with M1)
docker-compose.yml  Local infra: postgres 15, redis 7, minio, localstack (KMS)
```

## Milestones

- **M1** — Vault + servers (schema/RLS, envelope encryption, SSH test, base provisioning)
- **M2** — Clients, templates, schema-driven param form, pre-flight validation
- **M3** — Install pipeline + SSL (state machine, nginx vhost, certbot, SSE, rollback)
- **M4** — Site record + tracking (sf.js beacon, campaign links, analytics)
- **M5** — PushVault + leads + SSL renewal alerts
