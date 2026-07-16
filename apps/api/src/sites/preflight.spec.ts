import { describe, expect, it } from 'vitest';
import { runPreflight } from './preflight';

const VALID_PARAMS = {
  brand: { business_name: 'Acme Deals' },
  seo: { page_title: 'Best AC Deals in Delhi', meta_description: 'Top AC offers with free installation and 30-day returns.' },
  hero: { headline: 'Beat the heat', cta_text: 'Shop Now' },
  products: [
    {
      title: '1.5T Split AC',
      target_url: 'https://store.example.com/products/split-ac',
      bullets: ['5-star rating'],
    },
  ],
  trust: {
    business_name: 'Acme Deals',
    contact_email: 'help@acmedeals.example',
    contact_phone: '+91-99999-88888',
    address: '12 MG Road, New Delhi, 110001',
  },
  legal: {
    privacy_policy_md:
      'We respect your privacy. This policy describes what data we collect, why we collect it, and how you can contact us about it at any time.',
    terms_md: 'Standard terms and conditions apply to all purchases.',
    affiliate_disclosure_md: 'We may earn a commission from links on this page.',
  },
  ad_claims: ['Free shipping over $50', '30-day returns'],
};

const BASE = {
  destinationUrl: 'https://store.example.com',
  templateCategory: 'ecom_showcase',
};

describe('pre-flight validation (§8)', () => {
  it('valid params pass', () => {
    const result = runPreflight({ ...BASE, params: VALID_PARAMS });
    expect(result.errors).toEqual([]);
    expect(result.ok).toBe(true);
    expect(result.pending_build_checks.length).toBeGreaterThan(0);
  });

  it('missing privacy policy gives a field error', () => {
    const params = structuredClone(VALID_PARAMS);
    params.legal.privacy_policy_md = '';
    const result = runPreflight({ ...BASE, params });
    expect(result.ok).toBe(false);
    expect(result.errors).toContainEqual({
      field: 'legal.privacy_policy_md',
      message: 'Privacy policy is required',
    });
  });

  it('too-short privacy policy gives a field error', () => {
    const params = structuredClone(VALID_PARAMS);
    params.legal.privacy_policy_md = 'We value privacy.';
    const result = runPreflight({ ...BASE, params });
    expect(result.errors.some((e) => e.field === 'legal.privacy_policy_md' && /too short/.test(e.message))).toBe(true);
  });

  it('off-host outbound link gives a field error', () => {
    const params = structuredClone(VALID_PARAMS);
    params.products[0].target_url = 'https://evil-affiliate.example.net/buy';
    const result = runPreflight({ ...BASE, params });
    expect(result.ok).toBe(false);
    expect(
      result.errors.some(
        (e) => e.field === 'products[0].target_url' && /off-destination/.test(e.message),
      ),
    ).toBe(true);
  });

  it('www. and bare destination host are treated as the same host', () => {
    const params = structuredClone(VALID_PARAMS);
    params.products[0].target_url = 'https://www.store.example.com/products/x';
    const result = runPreflight({ ...BASE, params });
    expect(result.errors.filter((e) => e.field.startsWith('products'))).toEqual([]);
  });

  it('non-HTTPS product link gives a field error', () => {
    const params = structuredClone(VALID_PARAMS);
    params.products[0].target_url = 'http://store.example.com/products/x';
    const result = runPreflight({ ...BASE, params });
    expect(result.errors.some((e) => e.field === 'products[0].target_url' && /HTTPS/.test(e.message))).toBe(true);
  });

  it('missing contact email / address give field errors', () => {
    const params = structuredClone(VALID_PARAMS);
    params.trust.contact_email = '';
    params.trust.address = '  ';
    const result = runPreflight({ ...BASE, params });
    const fields = result.errors.map((e) => e.field);
    expect(fields).toContain('trust.contact_email');
    expect(fields).toContain('trust.address');
  });

  it('prelander/comparison require affiliate disclosure', () => {
    const params = structuredClone(VALID_PARAMS);
    params.legal.affiliate_disclosure_md = '';
    const ecom = runPreflight({ ...BASE, params, templateCategory: 'ecom_showcase' });
    expect(ecom.errors.some((e) => e.field === 'legal.affiliate_disclosure_md')).toBe(false);
    const prelander = runPreflight({ ...BASE, params, templateCategory: 'prelander' });
    expect(prelander.errors.some((e) => e.field === 'legal.affiliate_disclosure_md')).toBe(true);
  });

  it('non-HTTPS destination URL gives a field error', () => {
    const result = runPreflight({
      ...BASE,
      destinationUrl: 'http://store.example.com',
      params: VALID_PARAMS,
    });
    expect(result.errors.some((e) => e.field === 'destination_url')).toBe(true);
  });

  it('schema maxLength is enforced (SEO title 60)', () => {
    const params = structuredClone(VALID_PARAMS);
    params.seo.page_title = 'x'.repeat(75);
    const result = runPreflight({
      ...BASE,
      params,
      paramSchema: {
        type: 'object',
        properties: {
          seo: {
            type: 'object',
            required: ['page_title'],
            properties: { page_title: { type: 'string', title: 'Page title', maxLength: 60 } },
          },
        },
      },
    });
    expect(result.errors.some((e) => e.field === 'seo.page_title' && /maximum 60/.test(e.message))).toBe(true);
  });
});
