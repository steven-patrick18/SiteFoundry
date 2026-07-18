// Creates the initial tenant, admin user, and the US-market stock template
// library (§15). Runs as the DB owner (bypasses RLS) — dev/bootstrap only.
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

// ── US-standard stock legal text (operators edit per client, §6) ──────────
const US_PRIVACY_DEFAULT = `## Privacy Policy

We collect only what we need to operate this page: basic analytics (page views, clicks) and any details you submit voluntarily. We never sell your personal information.

**Your choices.** You may request access to, or deletion of, your data at any time by emailing us. California residents may exercise their rights under the CCPA/CPRA, and we honor Global Privacy Control signals.

**Contact.** Questions about this policy? Email us — our contact details are in the footer of every page.`;

const US_TERMS_DEFAULT = `## Terms of Use

Prices, availability, shipping, and returns are governed by the destination store shown at checkout. All product names and trademarks belong to their respective owners. This site is intended for United States residents. These terms are governed by the laws of the state listed in our contact address.`;

const US_DISCLOSURE_DEFAULT = `**Advertising Disclosure:** We may earn a commission when you buy through links on this page. This never affects the price you pay. Rankings and picks reflect our own evaluation criteria.`;

// TCPA-style consent wording — the US standard for paid lead generation.
const US_TCPA_CONSENT = `By checking this box, I agree to be contacted at the phone number and email provided, including by automated technology and SMS. Consent is not a condition of purchase. Message & data rates may apply. See our Privacy Policy.`;

/** Standard parameter blocks from §6 step 4, shared by all stock templates. */
function baseParamSchema(opts: {
  products?: boolean;
  leadForm?: boolean;
  requireDisclosure?: boolean;
  defaults?: {
    headline?: string;
    subheadline?: string;
    cta?: string;
    leadHeading?: string;
    leadSubmit?: string;
    consent?: string;
    collectZip?: boolean;
  };
}) {
  const d = opts.defaults ?? {};
  const properties: Record<string, unknown> = {
    brand: {
      type: 'object',
      title: 'Brand',
      required: ['business_name'],
      properties: {
        business_name: { type: 'string', title: 'Brand/business name' },
        logo_url: { type: 'string', format: 'uri', title: 'Logo URL' },
        primary_color: { type: 'string', format: 'color', title: 'Primary color', default: '#4f46e5' },
        secondary_color: { type: 'string', format: 'color', title: 'Secondary color', default: '#22c55e' },
        font: { type: 'string', title: 'Font', enum: ['Inter', 'Poppins', 'Roboto'], default: 'Inter' },
      },
    },
    seo: {
      type: 'object',
      title: 'SEO',
      required: ['page_title', 'meta_description'],
      properties: {
        page_title: { type: 'string', title: 'Page title', maxLength: 60 },
        meta_description: { type: 'string', title: 'Meta description', maxLength: 160 },
        og_image_url: { type: 'string', format: 'uri', title: 'OG image URL' },
      },
    },
    hero: {
      type: 'object',
      title: 'Hero',
      required: ['headline', 'cta_text'],
      properties: {
        headline: { type: 'string', title: 'Main headline', ...(d.headline ? { default: d.headline } : {}) },
        subheadline: { type: 'string', title: 'Subheadline', ...(d.subheadline ? { default: d.subheadline } : {}) },
        cta_text: { type: 'string', title: 'CTA button text', default: d.cta ?? 'Shop Now' },
        hero_image_url: { type: 'string', format: 'uri', title: 'Hero image URL' },
      },
    },
    ...(opts.products
      ? {
          products: {
            type: 'array',
            title: 'Products',
            maxItems: 12,
            items: {
              type: 'object',
              required: ['title', 'target_url'],
              properties: {
                title: { type: 'string', title: 'Title' },
                image_url: { type: 'string', format: 'uri', title: 'Image URL' },
                price: { type: 'string', title: 'Price (USD, e.g. $329.99)' },
                compare_price: { type: 'string', title: 'Compare-at price' },
                rating: { type: 'number', title: 'Rating (0-5)', minimum: 0, maximum: 5 },
                review_count: { type: 'number', title: 'Review count' },
                store_name: { type: 'string', title: 'Seller / store name' },
                delivery_time: { type: 'string', title: 'Delivery estimate (e.g. "Get it by Mon, Jul 20")' },
                shipping_cost: { type: 'string', title: 'Shipping (e.g. "Free delivery")' },
                badge: { type: 'string', title: 'Badge (e.g. "Best seller")' },
                bullets: {
                  type: 'array', title: 'Bullet points', maxItems: 5,
                  items: { type: 'string' },
                },
                target_url: { type: 'string', format: 'uri', title: 'Product link on store' },
                offers: {
                  type: 'array',
                  title: 'Store offers (price comparison)',
                  maxItems: 6,
                  items: {
                    type: 'object',
                    required: ['store_name', 'price', 'target_url'],
                    properties: {
                      store_name: { type: 'string', title: 'Store' },
                      price: { type: 'string', title: 'Price' },
                      shipping_cost: { type: 'string', title: 'Shipping' },
                      delivery_time: { type: 'string', title: 'Delivery estimate' },
                      badge: { type: 'string', title: 'Badge' },
                      target_url: { type: 'string', format: 'uri', title: 'Offer link (host must be an allowed store)' },
                    },
                  },
                },
              },
            },
          },
        }
      : {}),
    ...(opts.leadForm
      ? {
          lead_form: {
            type: 'object',
            title: 'Lead form',
            required: ['submit_text'],
            properties: {
              heading: { type: 'string', title: 'Form heading', default: d.leadHeading ?? 'Get a free quote' },
              submit_text: { type: 'string', title: 'Submit button text', default: d.leadSubmit ?? 'Get My Free Quote' },
              collect_phone: { type: 'boolean', title: 'Collect phone number', default: true },
              collect_zip: { type: 'boolean', title: 'Collect ZIP code (US targeting)', default: d.collectZip ?? true },
              consent_text: {
                type: 'string', format: 'markdown', title: 'Consent text (TCPA)',
                default: d.consent ?? US_TCPA_CONSENT,
              },
            },
          },
        }
      : {}),
    trust: {
      type: 'object',
      title: 'Trust & contact (required to publish)',
      required: ['business_name', 'contact_email', 'contact_phone', 'address'],
      properties: {
        business_name: { type: 'string', title: 'Business name (must match brand)' },
        contact_email: { type: 'string', format: 'email', title: 'Contact email' },
        contact_phone: { type: 'string', title: 'Contact phone (e.g. +1 (555) 555-0134)' },
        address: { type: 'string', title: 'Physical US address (street, city, state, ZIP)' },
      },
    },
    legal: {
      type: 'object',
      title: 'Legal (required to publish — US stock text provided, edit per client)',
      required: opts.requireDisclosure
        ? ['privacy_policy_md', 'terms_md', 'affiliate_disclosure_md']
        : ['privacy_policy_md', 'terms_md'],
      properties: {
        privacy_policy_md: {
          type: 'string', format: 'markdown',
          title: 'Privacy policy (min 100 chars — CCPA/CPRA stock text)',
          default: US_PRIVACY_DEFAULT,
        },
        terms_md: {
          type: 'string', format: 'markdown', title: 'Terms & conditions',
          default: US_TERMS_DEFAULT,
        },
        affiliate_disclosure_md: {
          type: 'string', format: 'markdown', title: 'Affiliate/ad disclosure (FTC)',
          default: US_DISCLOSURE_DEFAULT,
        },
      },
    },
    ad_claims: {
      type: 'array',
      title: 'Ad claims (each must appear on the page)',
      items: { type: 'string' },
    },
  };
  return { type: 'object', properties };
}

const STOCK_TEMPLATES = [
  // ── retail / e-commerce traffic ────────────────────────────────────────
  {
    name: 'Product Showcase',
    category: 'ecom_showcase',
    description:
      'Shopping-results style catalog: search bar, filter chips, price comparison across stores. For high-volume Shopping/PMax traffic.',
    paramSchema: baseParamSchema({ products: true }),
  },
  {
    name: 'Offer Awareness',
    category: 'offer_awareness',
    description:
      'Single-offer hero page with benefits, trust badges, and one strong CTA to the store.',
    paramSchema: baseParamSchema({ products: true }),
  },
  {
    name: 'Mega Sale Event',
    category: 'offer_awareness',
    description:
      'Seasonal US sale page (Black Friday, Memorial Day, Prime-time). Urgency hero + deal grid. Pair with high-volume "sale/deals" keywords.',
    paramSchema: baseParamSchema({
      products: true,
      defaults: {
        headline: 'Black Friday Mega Sale — up to 60% off',
        subheadline: 'Doorbuster deals, updated hourly. Free 2-day shipping on everything.',
        cta: 'Shop the Sale',
      },
    }),
  },
  // ── informational / directory traffic (huge "contact / customer service" volume) ─
  {
    name: 'US Store Directory',
    category: 'retailers',
    description:
      'Content-rich directory of major US online retailers — a page per store with customer-service contact details, hours, headquarters, help links, FAQ, and SEO structured data. Built for high-volume informational keywords ("<store> customer service number", "how to contact <store>", "<store> returns").',
    paramSchema: baseParamSchema({
      defaults: {
        headline: 'US Online Store Directory — Contact & Customer Service Info',
        subheadline:
          "Phone numbers, hours, headquarters, help centers and shopping guides for America's biggest online retailers.",
        cta: 'Browse Stores',
      },
    }),
  },
  // ── affiliate / review traffic ─────────────────────────────────────────
  {
    name: 'Comparison Page',
    category: 'comparison',
    description:
      'Compare 2-5 products/options with a recommended pick. Requires FTC affiliate disclosure.',
    paramSchema: baseParamSchema({ products: true, requireDisclosure: true }),
  },
  {
    name: 'Top 10 Ranking',
    category: 'comparison',
    description:
      '"Best X of 2026" ranked list — the classic high-CTR US affiliate format for "best/top/review" keywords. Ranked rows with #1 pick.',
    paramSchema: baseParamSchema({
      products: true,
      requireDisclosure: true,
      defaults: {
        headline: 'The 10 Best Window ACs of 2026 (Lab Tested)',
        subheadline: 'We tested 24 models for 30 days. These 10 earned a spot.',
        cta: 'Check Price',
      },
    }),
  },
  {
    name: 'Prelander',
    category: 'prelander',
    description:
      'Advertorial-style pre-landing page warming traffic before the store. Requires FTC affiliate disclosure.',
    paramSchema: baseParamSchema({ requireDisclosure: true }),
  },
  // ── lead generation traffic (highest CPC, huge US volume) ─────────────
  {
    name: 'Lead Capture',
    category: 'lead_page',
    description:
      'General consented lead form (name/email/phone/ZIP) with webhook delivery and TCPA consent text.',
    paramSchema: baseParamSchema({ leadForm: true }),
  },
  {
    name: 'Insurance Quotes',
    category: 'lead_page',
    description:
      'US insurance quote funnel (auto/home/life/Medicare keywords — massive volume). ZIP-first form, TCPA consent, licensing line in trust block.',
    paramSchema: baseParamSchema({
      leadForm: true,
      requireDisclosure: true,
      defaults: {
        headline: 'Compare auto insurance rates in your ZIP',
        subheadline: 'Drivers who compare save an average of $647/year. Free, no obligation.',
        cta: 'See My Rates',
        leadHeading: 'See quotes for your ZIP code',
        leadSubmit: 'Compare My Rates',
        collectZip: true,
      },
    }),
  },
  {
    name: 'Home Services Quote',
    category: 'lead_page',
    description:
      'Local US home services funnel (HVAC, roofing, plumbing, solar — high-intent "near me" keywords). ZIP + phone capture with TCPA consent.',
    paramSchema: baseParamSchema({
      leadForm: true,
      defaults: {
        headline: 'Licensed HVAC pros in your area — free quotes in 2 hours',
        subheadline: 'Compare up to 3 local quotes. No call-out fees, no obligation.',
        cta: 'Get Free Quotes',
        leadHeading: 'Book your free estimate',
        leadSubmit: 'Request My Quotes',
        collectZip: true,
      },
    }),
  },
];

async function main() {
  const email = (process.env.SEED_ADMIN_EMAIL ?? 'admin@sitefoundry.local').toLowerCase();
  const password = process.env.SEED_ADMIN_PASSWORD ?? 'admin12345';

  let tenant = await prisma.tenant.findFirst({ where: { name: 'SiteFoundry' } });
  if (!tenant) {
    tenant = await prisma.tenant.create({
      data: { name: 'SiteFoundry', plan: 'internal' },
    });
    console.log(`Created tenant ${tenant.id}`);
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (!existing) {
    await prisma.user.create({
      data: {
        tenantId: tenant.id,
        email,
        passwordHash: bcrypt.hashSync(password, 10),
        role: 'admin',
      },
    });
    console.log(`Created admin user: ${email} / ${password}`);
  } else {
    console.log(`Admin user already exists: ${email}`);
  }

  // Stock templates are global (tenant_id NULL) — visible to every tenant.
  for (const t of STOCK_TEMPLATES) {
    const previewImageUrl = `/previews/thumbs/${t.category}.svg`;
    const found = await prisma.template.findFirst({
      where: { tenantId: null, name: t.name },
    });
    if (found) {
      await prisma.template.update({
        where: { id: found.id },
        data: {
          description: t.description,
          paramSchema: t.paramSchema as any,
          previewImageUrl,
        },
      });
      console.log(`Updated stock template: ${t.name}`);
    } else {
      await prisma.template.create({
        data: {
          tenantId: null,
          name: t.name,
          category: t.category,
          description: t.description,
          paramSchema: t.paramSchema as any,
          repoPath: `stock/${t.category}`,
          previewImageUrl,
        },
      });
      console.log(`Created stock template: ${t.name}`);
    }
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
