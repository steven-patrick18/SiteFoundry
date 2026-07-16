# SiteFoundry

Server-connected landing site deployment platform — a multi-tenant control
panel that SSHes into client/agency servers, stores credentials in an
encrypted vault, provisions Astro landing sites with nginx + HTTPS, and keeps
a full operations record per client, site, server, domain, SSL cert, and ad
campaign.

Spec: `SiteFoundry Developer Build Doc v3 Final.docx` (v3.0, in repo root).
Built milestone by milestone (§14 of the doc). **Current state: project
scaffolding only — no milestone features yet.**

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

## Quickstart (§15)

```bash
# 1. Infrastructure
docker compose up -d          # postgres, redis, minio, localstack

# 2. Create the mock KMS master key (needs awslocal or aws --endpoint-url)
awslocal kms create-key --description "sitefoundry-dev-master"
# put KeyMetadata.KeyId into .env as KMS_MASTER_KEY_ID

# 3. Install + configure
pnpm install
cp .env.example .env

# 4. Database (from Milestone M1 onward)
pnpm prisma migrate dev
pnpm seed

# 5. Run
pnpm dev        # API http://localhost:3000/api/v1  +  dashboard http://localhost:5173
pnpm worker     # deploy/build worker (separate terminal)
```

Health check: `GET http://localhost:3000/api/v1/health`

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
