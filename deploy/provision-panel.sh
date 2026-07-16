#!/usr/bin/env bash
# One-time provisioning for the SiteFoundry PANEL host (Ubuntu 22.04/24.04).
# Installs Node 20 + pnpm, PostgreSQL 15, Redis, nginx, certbot; clones the
# repo; builds; creates systemd services; configures the nginx reverse proxy
# and issues HTTPS for the panel domain.
#
# Usage (run as root on the panel server):
#   PANEL_DOMAIN=sitefoundry.voipzap.com \
#   CERTBOT_EMAIL=you@example.com \
#   REPO_URL=https://github.com/steven-patrick18/SiteFoundry.git \
#   bash provision-panel.sh
set -euo pipefail

PANEL_DOMAIN="${PANEL_DOMAIN:?set PANEL_DOMAIN, e.g. sitefoundry.voipzap.com}"
CERTBOT_EMAIL="${CERTBOT_EMAIL:?set CERTBOT_EMAIL}"
REPO_URL="${REPO_URL:?set REPO_URL}"
APP_DIR="${APP_DIR:-/opt/sitefoundry}"
APP_USER="${APP_USER:-sitefoundry}"
DB_PASS="${DB_PASS:-$(openssl rand -hex 16)}"
APP_DB_PASS="${APP_DB_PASS:-$(openssl rand -hex 16)}"

echo "== SiteFoundry panel provisioning: $PANEL_DOMAIN =="
export DEBIAN_FRONTEND=noninteractive

# ── base packages ─────────────────────────────────────────────────────────
# build-essential + python3 let native modules (ssh2/cpu-features) compile.
apt-get update -y
apt-get install -y curl git ufw nginx postgresql redis-server \
  certbot python3-certbot-nginx ca-certificates gnupg openssl \
  build-essential python3 unzip

# Node 20 + pnpm. Pin pnpm to a Node-20-compatible version — pnpm@latest
# (11.x) requires node:sqlite / Node 22+ and crashes on Node 20.
PNPM_VERSION="${PNPM_VERSION:-10.33.4}"
if ! command -v node >/dev/null 2>&1; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
fi
# Remove any stale pnpm/pnpx shims (e.g. from a prior corepack attempt) so
# the npm global install can't fail with EEXIST.
rm -f /usr/bin/pnpm /usr/bin/pnpx /usr/local/bin/pnpm /usr/local/bin/pnpx
corepack disable >/dev/null 2>&1 || true
npm install -g --force "pnpm@${PNPM_VERSION}"

# ── app user + code ───────────────────────────────────────────────────────
id -u "$APP_USER" >/dev/null 2>&1 || useradd -m -s /bin/bash "$APP_USER"
mkdir -p "$APP_DIR"
if [ ! -d "$APP_DIR/.git" ]; then
  git clone "$REPO_URL" "$APP_DIR"
fi
chown -R "$APP_USER":"$APP_USER" "$APP_DIR"

# ── database ──────────────────────────────────────────────────────────────
# Reuse credentials already written to .env so re-runs stay consistent; the
# owner role's password is always synced (self-healing after partial runs).
if [ -f "$APP_DIR/.env" ]; then
  ENV_DB_PASS="$(sed -n 's#^DATABASE_URL=postgresql://sitefoundry:\([^@]*\)@.*#\1#p' "$APP_DIR/.env" | head -1)"
  ENV_APP_DB_PASS="$(sed -n 's#^APP_DATABASE_URL=postgresql://sitefoundry_app:\([^@]*\)@.*#\1#p' "$APP_DIR/.env" | head -1)"
  DB_PASS="${ENV_DB_PASS:-$DB_PASS}"
  APP_DB_PASS="${ENV_APP_DB_PASS:-$APP_DB_PASS}"
fi

# Owner role gets CREATEROLE so the RLS migration can create the restricted
# app role; the app role is also pre-created here with the .env password so
# the migration's own CREATE ROLE is a no-op (and passwords stay in sync).
sudo -u postgres psql -v ON_ERROR_STOP=1 <<SQL
DO \$\$ BEGIN
  -- BYPASSRLS: the owner/admin connection (migrations, seed, pre-auth login
  -- lookup, internal hooks) bypasses RLS — like the local superuser did. The
  -- restricted runtime role sitefoundry_app is NOT granted this and stays
  -- fully RLS-enforced, preserving tenant isolation.
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='sitefoundry') THEN
    CREATE ROLE sitefoundry LOGIN CREATEROLE BYPASSRLS PASSWORD '${DB_PASS}';
  ELSE
    ALTER ROLE sitefoundry WITH LOGIN CREATEROLE BYPASSRLS PASSWORD '${DB_PASS}';
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='sitefoundry_app') THEN
    CREATE ROLE sitefoundry_app LOGIN PASSWORD '${APP_DB_PASS}';
  ELSE
    ALTER ROLE sitefoundry_app WITH LOGIN PASSWORD '${APP_DB_PASS}';
  END IF;
END \$\$;
SELECT 'CREATE DATABASE sitefoundry OWNER sitefoundry'
  WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname='sitefoundry')\gexec
SQL

# ── env file ──────────────────────────────────────────────────────────────
if [ ! -f "$APP_DIR/.env" ]; then
  cat > "$APP_DIR/.env" <<ENV
NODE_ENV=production
PORT=3000
DATABASE_URL=postgresql://sitefoundry:${DB_PASS}@localhost:5432/sitefoundry
APP_DATABASE_URL=postgresql://sitefoundry_app:${APP_DB_PASS}@localhost:5432/sitefoundry
REDIS_URL=redis://localhost:6379
# inline: installs run in the API process so live SSE progress reaches the
# browser. 'bullmq' offloads to the worker but needs a Redis pub/sub bridge
# for progress (not yet implemented) — use inline until then.
JOBS_MODE=inline
KMS_PROVIDER=local-dev
LOCAL_KMS_MASTER_KEY=$(openssl rand -hex 32)
JWT_SECRET=$(openssl rand -hex 32)
INTERNAL_SECRET=$(openssl rand -hex 32)
LEAD_IP_SALT=$(openssl rand -hex 16)
PANEL_PUBLIC_URL=https://${PANEL_DOMAIN}
APP_BASE_URL=https://${PANEL_DOMAIN}
ALLOW_SELF_UPDATE=true
# Fill these in after provisioning, then: systemctl restart sitefoundry-api
SERPAPI_KEY=
S3_ENDPOINT=
S3_BUCKET=sitefoundry
S3_KEY=
S3_SECRET=
ENV
  chown "$APP_USER":"$APP_USER" "$APP_DIR/.env"
  chmod 600 "$APP_DIR/.env"
fi

# the app-role password must match the RLS migration; export for it
grep -q "APP_DB_PASS" "$APP_DIR/.env" 2>/dev/null || true

# ── build ─────────────────────────────────────────────────────────────────
cd "$APP_DIR"
sudo -u "$APP_USER" HOME="/home/$APP_USER" bash -lc "cd $APP_DIR && pnpm install --frozen-lockfile && pnpm prisma migrate deploy && pnpm prisma generate && pnpm -r build && pnpm previews && pnpm seed"

# align the restricted app role's password with .env (RLS migration created it)
sudo -u postgres psql -v ON_ERROR_STOP=1 -c "ALTER ROLE sitefoundry_app WITH PASSWORD '${APP_DB_PASS}';" 2>/dev/null || true

# allow the app user to restart its own services (for in-app updates).
# List both /bin and /usr/bin paths so it matches regardless of how sudo
# resolves systemctl on this distro.
cat > /etc/sudoers.d/sitefoundry <<SUDO
${APP_USER} ALL=(root) NOPASSWD: /bin/systemctl restart sitefoundry-api, /bin/systemctl restart sitefoundry-worker, /usr/bin/systemctl restart sitefoundry-api, /usr/bin/systemctl restart sitefoundry-worker
SUDO
chmod 440 /etc/sudoers.d/sitefoundry
visudo -cf /etc/sudoers.d/sitefoundry >/dev/null

# ── systemd services ──────────────────────────────────────────────────────
cp "$APP_DIR/deploy/sitefoundry-api.service" /etc/systemd/system/
cp "$APP_DIR/deploy/sitefoundry-worker.service" /etc/systemd/system/
sed -i "s#__APP_DIR__#$APP_DIR#g; s#__APP_USER__#$APP_USER#g" /etc/systemd/system/sitefoundry-*.service
systemctl daemon-reload
systemctl enable --now sitefoundry-api sitefoundry-worker

# ── nginx reverse proxy + HTTPS ───────────────────────────────────────────
sed "s#__PANEL_DOMAIN__#$PANEL_DOMAIN#g; s#__APP_DIR__#$APP_DIR#g" \
  "$APP_DIR/deploy/nginx-panel.conf" > /etc/nginx/sites-available/sitefoundry
ln -sf /etc/nginx/sites-available/sitefoundry /etc/nginx/sites-enabled/sitefoundry
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx

certbot --nginx -d "$PANEL_DOMAIN" --non-interactive --agree-tos -m "$CERTBOT_EMAIL" --redirect

# ── firewall ──────────────────────────────────────────────────────────────
ufw allow 22/tcp && ufw allow 80/tcp && ufw allow 443/tcp && ufw --force enable

echo ""
echo "== DONE =="
echo "Panel:    https://${PANEL_DOMAIN}"
echo "Login:    admin@sitefoundry.local / admin12345  (CHANGE THIS PASSWORD in Settings)"
echo "Env:      ${APP_DIR}/.env  (chmod 600 — add SERPAPI_KEY etc, then: systemctl restart sitefoundry-api)"
echo "Updates:  Settings > Software Update > Update now  (or: bash ${APP_DIR}/deploy/update.sh)"
