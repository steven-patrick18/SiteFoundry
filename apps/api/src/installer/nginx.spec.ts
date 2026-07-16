import { describe, expect, it } from 'vitest';
import { generateVhost, sitePaths, systemUserFor } from './nginx';

describe('nginx vhost generator', () => {
  const conf = generateVhost({
    siteSystemUser: 'site_abc12345',
    domain: 'acdeals.example.com',
    extraDomains: ['www.acdeals.example.com'],
    documentRoot: '/home/site_abc12345/public',
  });

  it('serves the primary domain and aliases', () => {
    expect(conf).toContain('server_name acdeals.example.com www.acdeals.example.com;');
  });

  it('roots at the site user docroot with index.html', () => {
    expect(conf).toContain('root /home/site_abc12345/public;');
    expect(conf).toContain('index index.html;');
  });

  it('sets security headers and gzip (§9 step 5)', () => {
    expect(conf).toContain('add_header X-Frame-Options SAMEORIGIN always;');
    expect(conf).toContain('add_header X-Content-Type-Options nosniff always;');
    expect(conf).toContain('gzip on;');
  });

  it('allows the PushVault service worker scope', () => {
    expect(conf).toContain('location = /pv-sw.js');
    expect(conf).toContain('Service-Worker-Allowed');
  });

  it('404s unknown paths (try_files)', () => {
    expect(conf).toContain('try_files $uri $uri/ =404;');
  });
});

describe('site path helpers', () => {
  it('derives a stable short system user from site id', () => {
    expect(systemUserFor('a1b2c3d4-e5f6-7890-abcd-ef1234567890')).toBe('site_a1b2c3d4');
  });

  it('builds consistent remote paths', () => {
    const paths = sitePaths('site_a1b2c3d4', 'a1b2c3d4-e5f6-7890-abcd-ef1234567890');
    expect(paths.documentRoot).toBe('/home/site_a1b2c3d4/public');
    expect(paths.vhostAvailable).toBe('/etc/nginx/sites-available/site_a1b2c3d4e5f6');
  });
});
