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

# Drop Astro's content cache in the shared stock template so the next site
# build always reflects the just-pulled template code (never a stale cache).
rm -rf templates/stock/.astro

# Restart out-of-band so this script (and the API responding to the update
# request) can finish before the process is replaced.
echo "-- scheduling restart"
if command -v systemctl >/dev/null 2>&1; then
  # Restart each unit separately so it matches the per-unit sudoers rule.
  nohup sh -c 'sleep 2; sudo -n systemctl restart sitefoundry-api; sudo -n systemctl restart sitefoundry-worker' >/dev/null 2>&1 &
fi

echo "== update complete: now at $(git rev-parse --short HEAD) =="
