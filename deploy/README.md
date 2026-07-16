# Deploying the SiteFoundry panel to production

This puts the **control panel** (dashboard + API + worker) on a server and
serves it at `https://<your-domain>` with an auto-renewing Let's Encrypt
certificate. It is separate from the client landing sites the panel deploys.

Target: **Ubuntu 22.04 / 24.04**, 4 GB RAM, root SSH. Example domain here:
`sitefoundry.voipzap.com` → your server IP (A record already set).

## 1. Connect from PowerShell

```powershell
ssh root@192.255.139.21
```

(Use your key or the root password your host gave you. First connect will ask
to trust the host key — type `yes`.)

## 2. One-time provisioning (run ON the server)

```bash
apt-get update && apt-get install -y git
git clone https://github.com/steven-patrick18/SiteFoundry.git /opt/sitefoundry

PANEL_DOMAIN=sitefoundry.voipzap.com \
CERTBOT_EMAIL=you@yourdomain.com \
REPO_URL=https://github.com/steven-patrick18/SiteFoundry.git \
bash /opt/sitefoundry/deploy/provision-panel.sh
```

This installs Node 20, PostgreSQL, Redis, nginx, and certbot; builds the app;
creates `sitefoundry-api` and `sitefoundry-worker` systemd services; configures
the nginx reverse proxy; and **issues HTTPS for the panel domain**. It finishes
in ~5–10 minutes and prints the login.

Then open **https://sitefoundry.voipzap.com** and sign in with
`admin@sitefoundry.local` / `admin12345` — **change this password immediately**
in Settings → Users.

## 3. Add your keys

Edit `/opt/sitefoundry/.env` (already has generated secrets) to add:

```
SERPAPI_KEY=...        # your SerpApi key, for the Product Finder
```

Then: `systemctl restart sitefoundry-api`

## 4. Updating from git (two ways)

**In-app (easiest):** Settings → Software Update → **Check for updates** →
**Update now**. It pulls the latest commit, runs migrations, rebuilds, and
restarts — the page reconnects automatically. (Enabled by
`ALLOW_SELF_UPDATE=true`, which the provisioner sets.)

**From the shell:**
```bash
bash /opt/sitefoundry/deploy/update.sh
```

Whenever you push changes to GitHub from your dev machine, click **Update now**
on the server and it pulls them in.

## Service management

```bash
systemctl status sitefoundry-api        # is it running?
journalctl -u sitefoundry-api -f        # live logs
systemctl restart sitefoundry-api sitefoundry-worker
```

## Notes

- The panel uses the `local-dev` KMS key by default (fine to start). For
  bank-grade key management switch `KMS_PROVIDER=aws` + AWS KMS later.
- Client SSL certs (for deployed landing sites) are separate and issued by
  the install pipeline on each target server — this HTTPS is only for the
  panel itself.
- Postgres/Redis run natively here (not Docker) so no Docker is required on
  the panel server.
