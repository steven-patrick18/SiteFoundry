// Builds a live demo preview of the stock template for every category into
// .local/previews/<category>/, plus an SVG thumbnail per category for the
// gallery cards. The API serves these under /previews. Demo content and
// photos are placeholders — operators replace them per client in the wizard.
//
// Run: pnpm previews
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const ROOT = resolve(__dirname, '..');
const OUT_ROOT = join(ROOT, '.local', 'previews');
const TEMPLATE_DIR = join(ROOT, 'templates', 'stock');

/** Deterministic "photo" — gradient SVG with a label, as a data URI. */
function photo(label: string, hueA: number, hueB: number, emoji = ''): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="hsl(${hueA},70%,55%)"/>
    <stop offset="1" stop-color="hsl(${hueB},70%,35%)"/>
  </linearGradient></defs>
  <rect width="800" height="600" fill="url(#g)"/>
  <text x="400" y="280" font-family="Arial" font-size="110" text-anchor="middle">${emoji}</text>
  <text x="400" y="390" font-family="Arial" font-size="40" font-weight="bold" fill="#ffffff" text-anchor="middle">${label}</text>
</svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

const DEST = 'https://store.acme-demo.example';

const baseTrust = {
  business_name: 'Acme Comfort Co',
  contact_email: 'support@acmecomfort.example',
  contact_phone: '+91 99999 88888',
  address: '12 MG Road, Connaught Place, New Delhi 110001',
};

const baseLegal = {
  privacy_policy_md:
    '## Your privacy matters\n\nWe collect only the analytics needed to run this page (page views, clicks) and any details you submit voluntarily. We never sell personal data. Contact us any time at support@acmecomfort.example to access or delete your data.',
  terms_md:
    '## Terms of use\n\nPrices and availability are shown by the destination store at checkout. All trademarks belong to their owners. Disputes are governed by the laws of India.',
  affiliate_disclosure_md:
    '**Disclosure:** We may earn a commission when you buy through links on this page. This never affects the price you pay.',
};

const products = [
  {
    title: 'ArcticPro 1.5T Inverter Split AC',
    image_url: photo('ArcticPro 1.5T', 210, 250, '❄️'),
    price: '₹32,990',
    compare_price: '₹41,990',
    bullets: ['5-star energy rating', 'Cools 18m² in 8 minutes', '10-year compressor warranty'],
    target_url: `${DEST}/products/arcticpro-15t`,
  },
  {
    title: 'BreezeMax Window AC 1T',
    image_url: photo('BreezeMax 1T', 190, 160, '🌬️'),
    price: '₹24,490',
    compare_price: '₹28,900',
    bullets: ['Best budget pick', 'Easy self-install', 'Low-noise night mode'],
    target_url: `${DEST}/products/breezemax-1t`,
  },
  {
    title: 'CoolNest Portable AC',
    image_url: photo('CoolNest Portable', 280, 320, '🧊'),
    price: '₹27,999',
    bullets: ['No installation needed', 'Moves room to room', 'Dehumidifier built in'],
    target_url: `${DEST}/products/coolnest-portable`,
  },
  {
    title: 'ZenAir Tower Fan + Cooler',
    image_url: photo('ZenAir Tower', 150, 120, '🍃'),
    price: '₹8,490',
    compare_price: '₹11,000',
    bullets: ['Uses 90% less power', 'Remote + timer', 'Great for small rooms'],
    target_url: `${DEST}/products/zenair-tower`,
  },
];

function demoParams(category: string) {
  const heroByCategory: Record<string, any> = {
    ecom_showcase: {
      headline: 'Beat the Delhi heat for less',
      subheadline: 'Hand-picked cooling deals, updated daily and price-checked against 6 stores.',
      cta_text: 'Shop All Deals',
      hero_image_url: photo('Summer Cooling Sale', 205, 260, '☀️'),
    },
    offer_awareness: {
      headline: 'ArcticPro Summer Sale — up to 40% off',
      subheadline: 'India’s highest-rated inverter AC, now at its lowest price of the year.',
      cta_text: 'Claim the Offer',
      hero_image_url: photo('Limited-Time Offer', 10, 40, '🔥'),
    },
    comparison: {
      headline: 'Best AC for Indian summers (2026 tested)',
      subheadline: 'We ran 4 bestsellers for 30 days. One clear winner.',
      cta_text: 'Check Price',
    },
    lead_page: {
      headline: 'Free AC installation quote in 2 hours',
      subheadline: 'Certified technicians across Delhi NCR. No visit charges.',
      cta_text: 'Get My Quote',
      hero_image_url: photo('Certified Technicians', 220, 180, '🛠️'),
    },
    prelander: {
      headline: 'Why 40,000 Delhi homes switched to inverter ACs',
      subheadline: 'The electricity-bill math nobody shows you',
      cta_text: 'See the Deal',
      hero_image_url: photo('The Inverter Switch', 260, 300, '⚡'),
    },
  };

  return {
    brand: {
      business_name: 'Acme Comfort Co',
      logo_url: '',
      primary_color: category === 'offer_awareness' ? '#dc2626' : category === 'lead_page' ? '#0e7490' : '#4338ca',
      secondary_color: '#22c55e',
      font: 'Inter',
    },
    seo: {
      page_title: heroByCategory[category].headline.slice(0, 58),
      meta_description: 'Demo preview of the SiteFoundry stock template with placeholder content.',
      og_image_url: '',
    },
    hero: heroByCategory[category],
    products: category === 'lead_page' ? [] : products.slice(0, category === 'comparison' ? 3 : 4),
    ...(category === 'lead_page'
      ? {
          lead_form: {
            heading: 'Book your free quote',
            submit_text: 'Request Callback',
            collect_phone: true,
            consent_text: 'I agree to be contacted about my enquiry. See our privacy policy.',
          },
        }
      : {}),
    trust: baseTrust,
    legal: baseLegal,
    ad_claims:
      category === 'lead_page'
        ? ['Free quote in 2 hours', 'No visit charges', 'Certified technicians']
        : ['Free shipping over ₹500', '30-day easy returns', 'Lowest price of the season'],
  };
}

/** Mini wireframe thumbnail per category for the gallery card. */
function thumbnail(category: string, label: string, hue: number): string {
  const blocks =
    category === 'comparison'
      ? `<rect x="30" y="150" width="340" height="24" rx="4" fill="#e6f7ee"/>
         <rect x="30" y="182" width="340" height="24" rx="4" fill="#eef1f6"/>
         <rect x="30" y="214" width="340" height="24" rx="4" fill="#eef1f6"/>`
      : category === 'lead_page'
        ? `<rect x="110" y="150" width="180" height="16" rx="4" fill="#dfe5ee"/>
           <rect x="110" y="174" width="180" height="16" rx="4" fill="#dfe5ee"/>
           <rect x="110" y="198" width="180" height="16" rx="4" fill="#dfe5ee"/>
           <rect x="110" y="222" width="180" height="20" rx="6" fill="hsl(${hue},70%,50%)"/>`
        : `<rect x="30" y="150" width="105" height="90" rx="6" fill="#eef1f6"/>
           <rect x="147" y="150" width="105" height="90" rx="6" fill="#eef1f6"/>
           <rect x="264" y="150" width="105" height="90" rx="6" fill="#eef1f6"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="260" viewBox="0 0 400 260">
  <rect width="400" height="260" fill="#f8fafc"/>
  <rect width="400" height="96" fill="hsl(${hue},65%,45%)"/>
  <rect x="30" y="26" width="220" height="16" rx="4" fill="#ffffff" opacity=".95"/>
  <rect x="30" y="50" width="150" height="10" rx="4" fill="#ffffff" opacity=".6"/>
  <rect x="30" y="70" width="86" height="18" rx="6" fill="#22c55e"/>
  <rect x="0" y="104" width="400" height="26" fill="#eef4ff"/>
  <rect x="30" y="112" width="70" height="9" rx="4" fill="#94a3b8"/>
  <rect x="112" y="112" width="70" height="9" rx="4" fill="#94a3b8"/>
  <rect x="194" y="112" width="70" height="9" rx="4" fill="#94a3b8"/>
  ${blocks}
  <text x="200" y="253" font-family="Arial" font-size="11" fill="#94a3b8" text-anchor="middle">${label}</text>
</svg>`;
}

const CATEGORIES: Array<[string, string, number]> = [
  ['ecom_showcase', 'E-com Showcase', 245],
  ['offer_awareness', 'Offer Awareness', 5],
  ['comparison', 'Comparison', 160],
  ['lead_page', 'Lead Page', 195],
  ['prelander', 'Prelander', 275],
];

for (const [category, label, hue] of CATEGORIES) {
  const stageDir = join(OUT_ROOT, '.stage', category);
  const outDir = join(OUT_ROOT, category);
  mkdirSync(stageDir, { recursive: true });
  const paramsPath = join(stageDir, 'params.json');
  const sitePath = join(stageDir, 'site.json');
  writeFileSync(paramsPath, JSON.stringify(demoParams(category), null, 2));
  writeFileSync(
    sitePath,
    JSON.stringify({
      domain: `preview-${category.replace(/_/g, '-')}.sitefoundry.local`,
      category,
      destination_url: DEST,
      site_key: `preview_${category}`,
      tracking: {}, // previews carry no tracking tags
    }),
  );

  console.log(`Building preview: ${label} ...`);
  const result = spawnSync('pnpm', ['exec', 'astro', 'build'], {
    cwd: TEMPLATE_DIR,
    env: {
      ...process.env,
      SF_PARAMS_PATH: paramsPath,
      SF_SITE_PATH: sitePath,
      SF_OUTDIR: outDir,
      SF_SITE_URL: `https://preview.sitefoundry.local`,
    },
    shell: process.platform === 'win32',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (result.status !== 0) {
    console.error(result.stdout?.toString(), result.stderr?.toString());
    process.exit(1);
  }
}

const thumbsDir = join(OUT_ROOT, 'thumbs');
mkdirSync(thumbsDir, { recursive: true });
for (const [category, label, hue] of CATEGORIES) {
  writeFileSync(join(thumbsDir, `${category}.svg`), thumbnail(category, label, hue));
}

console.log(`Previews ready in ${OUT_ROOT} (served at /previews/<category>/)`);
