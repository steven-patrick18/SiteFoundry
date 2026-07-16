/**
 * Base provisioning steps (§5) — one-time per server, idempotent, Ubuntu/
 * Debian targets. Commands run under `sudo -n`; the deploy user needs
 * passwordless sudo (surfaced as an actionable error if missing).
 */
export interface ProvisionStep {
  key: string;
  title: string;
  command: string;
}

const NGINX_BASE_CONF = `
server_tokens off;
# Ubuntu's default nginx.conf already enables gzip; only extend the types
# (setting "gzip on;" again here is a duplicate directive and fails nginx -t).
gzip_types text/plain text/css application/json application/javascript text/xml application/xml image/svg+xml;
gzip_min_length 1024;
add_header X-Content-Type-Options nosniff always;
add_header X-Frame-Options SAMEORIGIN always;
add_header Referrer-Policy strict-origin-when-cross-origin always;
`.trim();

export function buildProvisionSteps(opts: {
  panelBaseUrl: string;
}): ProvisionStep[] {
  return [
    {
      key: 'apt_update',
      title: 'Updating package lists',
      command:
        'sudo -n DEBIAN_FRONTEND=noninteractive apt-get update -y',
    },
    {
      key: 'install_nginx',
      title: 'Installing nginx',
      command:
        'command -v nginx >/dev/null || sudo -n DEBIAN_FRONTEND=noninteractive apt-get install -y nginx',
    },
    {
      key: 'install_certbot',
      title: 'Installing certbot + nginx plugin',
      command:
        'command -v certbot >/dev/null || sudo -n DEBIAN_FRONTEND=noninteractive apt-get install -y certbot python3-certbot-nginx',
    },
    {
      key: 'install_node',
      title: 'Installing Node 20',
      command:
        'command -v node >/dev/null || (curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -n bash - && sudo -n DEBIAN_FRONTEND=noninteractive apt-get install -y nodejs)',
    },
    {
      key: 'firewall',
      title: 'Configuring firewall (ufw: 22, 80, 443)',
      command:
        'command -v ufw >/dev/null || sudo -n DEBIAN_FRONTEND=noninteractive apt-get install -y ufw; ' +
        'sudo -n ufw allow 22/tcp && sudo -n ufw allow 80/tcp && sudo -n ufw allow 443/tcp && sudo -n ufw --force enable',
    },
    {
      key: 'base_dir',
      title: 'Creating /var/www/sitefoundry',
      command: 'sudo -n mkdir -p /var/www/sitefoundry',
    },
    {
      key: 'nginx_base_conf',
      title: 'Applying nginx base config (gzip, security headers)',
      command:
        `printf '%s\\n' '${NGINX_BASE_CONF.replace(/'/g, `'\\''`).split('\n').join(`' '`)}' | sudo -n tee /etc/nginx/conf.d/sitefoundry-base.conf >/dev/null` +
        ' && sudo -n nginx -t',
    },
    {
      key: 'nginx_enable',
      title: 'Enabling and reloading nginx',
      command:
        'sudo -n systemctl enable nginx && sudo -n systemctl reload nginx',
    },
    {
      key: 'fail2ban',
      title: 'Installing fail2ban',
      command:
        'command -v fail2ban-server >/dev/null || sudo -n DEBIAN_FRONTEND=noninteractive apt-get install -y fail2ban',
    },
    {
      key: 'certbot_hook',
      title: 'Installing certbot auto-renew webhook',
      command:
        'sudo -n mkdir -p /etc/letsencrypt/renewal-hooks/deploy && ' +
        `printf '#!/bin/sh\\n# SiteFoundry: notify panel after successful renewal\\ncurl -fsS -m 10 -X POST "${opts.panelBaseUrl}/api/v1/internal/ssl-renewed/site" -H "content-type: application/json" -d "{\\"domains\\":\\"$RENEWED_DOMAINS\\"}" || true\\n' | sudo -n tee /etc/letsencrypt/renewal-hooks/deploy/sitefoundry.sh >/dev/null && ` +
        'sudo -n chmod +x /etc/letsencrypt/renewal-hooks/deploy/sitefoundry.sh',
    },
  ];
}
