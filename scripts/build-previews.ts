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

// USA-market demo (dollar prices, US delivery estimates, US contact block)
const baseTrust = {
  business_name: 'Acme Comfort Co',
  contact_email: 'support@acmecomfort.example',
  contact_phone: '+1 (415) 555-0134',
  address: '450 Market Street, Suite 700, San Francisco, CA 94105',
};

const baseLegal = {
  privacy_policy_md:
    '## Your privacy matters\n\nWe collect only the analytics needed to run this page (page views, clicks) and any details you submit voluntarily. We never sell personal data. Contact us any time at support@acmecomfort.example to access or delete your data.',
  terms_md:
    '## Terms of use\n\nPrices and availability are shown by the destination store at checkout. All trademarks belong to their owners. Disputes are governed by the laws of the State of California, USA.',
  affiliate_disclosure_md:
    '**Disclosure:** We may earn a commission when you buy through links on this page. This never affects the price you pay.',
};

const products = [
  {
    title: 'ArcticPro 12,000 BTU Smart Inverter Window AC',
    image_url: photo('ArcticPro 12K BTU', 210, 250, '❄️'),
    price: '$329.99',
    compare_price: '$429.99',
    rating: 4.7,
    review_count: 2841,
    store_name: 'Acme Comfort Store',
    shipping_cost: 'Free delivery',
    delivery_time: 'Get it by Tue, Jul 21',
    badge: 'Best seller',
    bullets: ['ENERGY STAR certified', 'Cools up to 550 sq ft', 'WiFi + voice control', '10-year compressor warranty'],
    target_url: `${DEST}/products/arcticpro-12k`,
    offers: [
      { store_name: 'Acme Comfort Store', price: '$329.99', shipping_cost: 'Free delivery', delivery_time: 'Get it by Tue, Jul 21', target_url: `${DEST}/products/arcticpro-12k` },
      { store_name: 'DealZone', price: '$324.50', shipping_cost: '$12.99 shipping', delivery_time: 'Get it Thu, Jul 23', target_url: 'https://dealzone-demo.example/p/arcticpro-12k' },
      { store_name: 'MegaMart', price: '$339.00', shipping_cost: 'Free delivery', delivery_time: 'Get it by Mon, Jul 20', badge: 'Fastest delivery', target_url: 'https://megamart-demo.example/item/arcticpro-12k' },
    ],
  },
  {
    title: 'BreezeMax 8,000 BTU Window AC',
    image_url: photo('BreezeMax 8K', 190, 160, '🌬️'),
    price: '$229.99',
    compare_price: '$279.99',
    rating: 4.4,
    review_count: 1203,
    store_name: 'Acme Comfort Store',
    shipping_cost: 'Free delivery',
    delivery_time: 'Get it by Wed, Jul 22',
    badge: 'Budget pick',
    bullets: ['Cools up to 350 sq ft', 'Easy self-install kit', 'Quiet 52 dB night mode'],
    target_url: `${DEST}/products/breezemax-8k`,
    offers: [
      { store_name: 'Acme Comfort Store', price: '$229.99', shipping_cost: 'Free delivery', delivery_time: 'Get it by Wed, Jul 22', target_url: `${DEST}/products/breezemax-8k` },
      { store_name: 'MegaMart', price: '$219.00', shipping_cost: 'Free delivery', delivery_time: 'Get it by Thu, Jul 23', target_url: 'https://megamart-demo.example/item/breezemax-8k' },
    ],
  },
  {
    title: 'CoolNest 10,000 BTU Portable AC',
    image_url: photo('CoolNest Portable', 280, 320, '🧊'),
    price: '$289.99',
    rating: 4.2,
    review_count: 687,
    store_name: 'Acme Comfort Store',
    shipping_cost: '$9.99 shipping',
    delivery_time: 'Get it Fri, Jul 24',
    bullets: ['No installation needed', 'Rolls room to room', 'Built-in dehumidifier'],
    target_url: `${DEST}/products/coolnest-portable`,
  },
  {
    title: 'ZenAir Evaporative Tower Cooler',
    image_url: photo('ZenAir Tower', 150, 120, '🍃'),
    price: '$89.99',
    compare_price: '$119.99',
    rating: 4.0,
    review_count: 412,
    store_name: 'Acme Comfort Store',
    shipping_cost: 'Free delivery',
    delivery_time: 'Get it by Tue, Jul 21',
    bullets: ['Uses 90% less power', 'Remote + 8h timer', 'Great for small rooms'],
    target_url: `${DEST}/products/zenair-tower`,
  },
];

function demoParams(category: string) {
  const heroByCategory: Record<string, any> = {
    ecom_showcase: {
      headline: 'Beat the summer heat for less',
      subheadline: 'Hand-picked cooling deals for the USA, price-checked daily across 6 major stores.',
      cta_text: 'Shop All Deals',
      hero_image_url: photo('Summer Cooling Sale', 205, 260, '☀️'),
    },
    offer_awareness: {
      headline: 'ArcticPro Summer Sale — up to 40% off',
      subheadline: 'America’s highest-rated smart window AC, now at its lowest price of the year.',
      cta_text: 'Claim the Offer',
      hero_image_url: photo('Limited-Time Offer', 10, 40, '🔥'),
    },
    comparison: {
      headline: 'Best window AC of 2026 (USA, lab tested)',
      subheadline: 'We ran 4 bestsellers for 30 days — compared on price, delivery speed, and noise. One clear winner.',
      cta_text: 'Check Price',
    },
    lead_page: {
      headline: 'Free AC installation quote in 2 hours',
      subheadline: 'Licensed HVAC technicians across the Bay Area. No call-out fees.',
      cta_text: 'Get My Quote',
      hero_image_url: photo('Certified Technicians', 220, 180, '🛠️'),
    },
    prelander: {
      headline: 'Why 40,000 US households switched to inverter ACs',
      subheadline: 'The electricity-bill math nobody shows you',
      cta_text: 'See the Deal',
      hero_image_url: photo('The Inverter Switch', 260, 300, '⚡'),
    },
    retailers: {
      headline: 'US Online Store Directory — Contact & Customer Service Info',
      subheadline:
        "Phone numbers, hours, headquarters, help centers and shopping guides for America's biggest online retailers.",
      cta_text: 'Browse Stores',
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
            heading: 'Book your free estimate',
            submit_text: 'Request My Quotes',
            collect_phone: true,
            collect_zip: true,
            consent_text:
              'By checking this box, I agree to be contacted at the phone number and email provided, including by automated technology and SMS. Consent is not a condition of purchase. Message & data rates may apply.',
          },
        }
      : {}),
    trust: baseTrust,
    legal: baseLegal,
    ad_claims:
      category === 'lead_page'
        ? ['Free quote in 2 hours', 'No call-out fees', 'Licensed HVAC technicians']
        : ['Free 2-day shipping', '30-day easy returns', 'Price-match guarantee'],
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
  ['retailers', 'US Store Directory', 210],
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
      SF_BASE: `/previews/${category}`,
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
