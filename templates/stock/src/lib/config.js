// Build-time site configuration, staged by the SiteFoundry build worker:
//   SF_PARAMS_PATH -> params.json   (operator-filled template parameters)
//   SF_SITE_PATH   -> site.json     ({domain, category, destination_url, tracking})
import { readFileSync } from 'node:fs';

function readJson(envVar, fallback) {
  const path = process.env[envVar];
  if (!path) return fallback;
  return JSON.parse(readFileSync(path, 'utf8'));
}

export const params = readJson('SF_PARAMS_PATH', {
  brand: { business_name: 'Preview Brand', primary_color: '#4f46e5', secondary_color: '#22c55e', font: 'Inter' },
  seo: { page_title: 'Preview page', meta_description: 'SiteFoundry template preview.' },
  hero: { headline: 'Preview headline', subheadline: 'Subheadline', cta_text: 'Shop Now' },
  products: [],
  trust: { business_name: 'Preview Brand', contact_email: 'hello@example.com', contact_phone: '+1-000', address: '1 Preview Street' },
  legal: { privacy_policy_md: 'Preview privacy policy.', terms_md: 'Preview terms.', affiliate_disclosure_md: '' },
  ad_claims: [],
});

export const site = readJson('SF_SITE_PATH', {
  domain: 'preview.example.com',
  category: 'ecom_showcase',
  destination_url: 'https://store.example.com',
  tracking: {},
});

/** Panel endpoint for live visitor product search (empty = disabled). */
export const searchUrl = site.search_url ?? '';

/** Outbound href to the destination store (UTM passthrough handled by sf.js). */
export function outbound(url) {
  return url || site.destination_url;
}

/**
 * Base path prefix. Empty for real deployments (sites live at the domain
 * root); set via SF_BASE for panel demo previews served under a subpath.
 */
export const base = (process.env.SF_BASE ?? '').replace(/\/$/, '');

export function href(path) {
  return `${base}${path}`;
}
