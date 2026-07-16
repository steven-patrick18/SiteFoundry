/** Canonical UTM sets per ad platform (§7.7). Pure — unit tested. */
export type Platform = 'google' | 'meta' | 'bing';

const PLATFORM_UTMS: Record<Platform, { source: string; medium: string }> = {
  google: { source: 'google', medium: 'cpc' },
  meta: { source: 'facebook', medium: 'paid_social' },
  bing: { source: 'bing', medium: 'cpc' },
};

export interface CampaignUtm {
  source: string;
  medium: string;
  campaign: string;
  content?: string;
  term?: string;
}

export function buildCampaignUtm(
  platform: Platform,
  campaignName: string,
  overrides: Partial<CampaignUtm> = {},
): CampaignUtm {
  const base = PLATFORM_UTMS[platform];
  return {
    source: overrides.source ?? base.source,
    medium: overrides.medium ?? base.medium,
    campaign: overrides.campaign ?? campaignName,
    ...(overrides.content ? { content: overrides.content } : {}),
    ...(overrides.term ? { term: overrides.term } : {}),
  };
}

export function buildFinalUrl(domain: string, utm: CampaignUtm): string {
  const url = new URL(`https://${domain}/`);
  url.searchParams.set('utm_source', utm.source);
  url.searchParams.set('utm_medium', utm.medium);
  url.searchParams.set('utm_campaign', utm.campaign);
  if (utm.content) url.searchParams.set('utm_content', utm.content);
  if (utm.term) url.searchParams.set('utm_term', utm.term);
  return url.toString();
}
