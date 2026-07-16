#!/usr/bin/env bash
# SiteFoundry panel updater — pull latest code, install, migrate, rebuild,
# and restart the API + worker services. Invoked by the in-app "Update now"
# button and runnable manually. Idempotent and safe to re-run.
set -euo pipefail

cd "$(dirname "$0")/.."   # repo root
echo "== SiteFoundry update @ $(date -u +%FT%TZ) =="

echo "-- git pull"
git fetch --quiet origin
BRANCH="$(git rev-parse --abbrev-ref HEAD)"
git pull --ff-only origin "$BRANCH"

echo "-- install deps"
pnpm install --frozen-lockfile

echo "-- db migrate"
pnpm prisma migrate deploy
pnpm prisma generate

echo "-- build"
pnpm -r build

# Restart out-of-band so this script (and the API responding to the update
# request) can finish before the process is replaced.
echo "-- scheduling restart"
if command -v systemctl >/dev/null 2>&1; then
  nohup sh -c 'sleep 2; sudo -n systemctl restart sitefoundry-api sitefoundry-worker' >/dev/null 2>&1 &
fi

echo "== update complete: now at $(git rev-parse --short HEAD) =="
