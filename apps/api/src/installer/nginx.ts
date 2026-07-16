/**
 * nginx vhost generator (§9 step 5). Written to
 * /etc/nginx/sites-available/site_{id} and symlinked into sites-enabled.
 * HTTP->HTTPS redirect is added by certbot --redirect at SSL issue time.
 */
export interface VhostInput {
  siteSystemUser: string;
  domain: string;
  extraDomains: string[];
  documentRoot: string;
}

export function generateVhost(input: VhostInput): string {
  const serverNames = [input.domain, ...input.extraDomains].join(' ');
  return `# Managed by SiteFoundry - do not edit by hand (site user: ${input.siteSystemUser})
server {
    listen 80;
    listen [::]:80;
    server_name ${serverNames};

    root ${input.documentRoot};
    index index.html;

    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml image/svg+xml;

    add_header X-Frame-Options SAMEORIGIN always;
    add_header X-Content-Type-Options nosniff always;
    add_header Referrer-Policy strict-origin-when-cross-origin always;

    location = /pv-sw.js {
        add_header Service-Worker-Allowed "/";
        try_files $uri =404;
    }

    location / {
        try_files $uri $uri/ =404;
    }

    location ~* \\.(css|js|png|jpg|jpeg|gif|webp|svg|ico|woff2?)$ {
        expires 7d;
        add_header Cache-Control "public, max-age=604800";
        try_files $uri =404;
    }
}
`;
}

/** Remote path helpers shared by installer and rollback. */
export function sitePaths(siteSystemUser: string, siteId: string) {
  const home = `/home/${siteSystemUser}`;
  return {
    home,
    documentRoot: `${home}/public`,
    releasesDir: `${home}/releases`,
    vhostAvailable: `/etc/nginx/sites-available/site_${siteId.replace(/-/g, '').slice(0, 12)}`,
    vhostEnabled: `/etc/nginx/sites-enabled/site_${siteId.replace(/-/g, '').slice(0, 12)}`,
  };
}

export function systemUserFor(siteId: string): string {
  return `site_${siteId.replace(/-/g, '').slice(0, 8)}`;
}
