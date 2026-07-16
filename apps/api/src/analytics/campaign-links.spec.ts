import { describe, expect, it } from 'vitest';
import { buildCampaignUtm, buildFinalUrl } from './campaign-links';

describe('campaign link generator (§7.7)', () => {
  it('google gets canonical google/cpc UTMs', () => {
    const utm = buildCampaignUtm('google', 'AC-Repair-Delhi-Search');
    expect(utm).toEqual({
      source: 'google', medium: 'cpc', campaign: 'AC-Repair-Delhi-Search',
    });
  });

  it('meta gets facebook/paid_social', () => {
    const utm = buildCampaignUtm('meta', 'AC-Repair-FB-Video');
    expect(utm.source).toBe('facebook');
    expect(utm.medium).toBe('paid_social');
  });

  it('bing gets bing/cpc', () => {
    expect(buildCampaignUtm('bing', 'X').source).toBe('bing');
  });

  it('builds the final paste-ready URL', () => {
    const utm = buildCampaignUtm('google', 'AC-Repair-Delhi-Search');
    const url = buildFinalUrl('acrepairs.delhi.example.com', utm);
    expect(url).toBe(
      'https://acrepairs.delhi.example.com/?utm_source=google&utm_medium=cpc&utm_campaign=AC-Repair-Delhi-Search',
    );
  });

  it('encodes campaign names with spaces', () => {
    const url = buildFinalUrl('x.example.com', buildCampaignUtm('meta', 'Summer Sale 2026'));
    expect(url).toContain('utm_campaign=Summer+Sale+2026');
    expect(() => new URL(url)).not.toThrow();
  });

  it('applies content/term overrides', () => {
    const utm = buildCampaignUtm('google', 'C', { content: 'ad-a', term: 'buy ac' });
    const url = buildFinalUrl('x.example.com', utm);
    expect(url).toContain('utm_content=ad-a');
    expect(url).toContain('utm_term=buy+ac');
  });
});
