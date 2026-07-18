import { describe, it, expect } from 'vitest';
import { sanitizeEdits, setPath } from '../src/content/content.service';

describe('sanitizeEdits (content-editing whitelist)', () => {
  it('keeps whitelisted content paths', () => {
    const out = sanitizeEdits({
      'hero.headline': '  Big   Sale  ',
      'hero.subheadline': 'Save now',
      'brand.business_name': 'MyCo',
      'trust.contact_phone': '1-800-555-0100',
      'ad_claims.0': 'Free shipping',
      'retailers.walmart.phone': '1-800-925-6278',
      'retailers.walmart.description': 'A store.',
    });
    expect(out['hero.headline']).toBe('Big Sale'); // whitespace collapsed + trimmed
    expect(out['brand.business_name']).toBe('MyCo');
    expect(out['ad_claims.0']).toBe('Free shipping');
    expect(out['retailers.walmart.phone']).toBe('1-800-925-6278');
    expect(Object.keys(out)).toHaveLength(7);
  });

  it('drops non-whitelisted / dangerous paths', () => {
    const out = sanitizeEdits({
      'tracking.ga4_id': 'G-EVIL',
      'legal.privacy_policy_md': 'hacked',
      destination_url: 'https://evil.example',
      'products.0.target_url': 'https://evil.example',
      'retailers.walmart.link': 'https://evil.example', // link not editable
      'brand.font': 'ComicSans', // not in whitelist
      'extraAllowedHosts.0': 'evil.example',
      '__proto__.polluted': 'x',
    });
    expect(out).toEqual({});
  });

  it('caps length and coerces to string', () => {
    const out = sanitizeEdits({ 'retailers.x.description': 'a'.repeat(9000), 'hero.headline': 12345 });
    expect(out['retailers.x.description'].length).toBe(4000);
    expect(out['hero.headline']).toBe('12345');
  });

  it('ignores bad slugs and non-string keys', () => {
    const out = sanitizeEdits({ 'retailers.BAD SLUG.phone': 'x', 'retailers.ok-slug.phone': 'y' });
    expect(out).toEqual({ 'retailers.ok-slug.phone': 'y' });
  });
});

describe('setPath', () => {
  it('sets nested object paths', () => {
    const root: any = {};
    setPath(root, 'hero.headline', 'Hi');
    setPath(root, 'retailers.walmart.phone', '123');
    expect(root).toEqual({ hero: { headline: 'Hi' }, retailers: { walmart: { phone: '123' } } });
  });
  it('creates arrays for numeric segments', () => {
    const root: any = {};
    setPath(root, 'ad_claims.0', 'A');
    setPath(root, 'ad_claims.1', 'B');
    expect(Array.isArray(root.ad_claims)).toBe(true);
    expect(root.ad_claims).toEqual(['A', 'B']);
  });
  it('preserves existing sibling values', () => {
    const root: any = { retailers: { walmart: { phone: '1', hours: '9-5' } } };
    setPath(root, 'retailers.walmart.phone', '2');
    expect(root.retailers.walmart).toEqual({ phone: '2', hours: '9-5' });
  });
});
