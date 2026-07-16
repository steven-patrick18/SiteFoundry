// Creates the initial tenant, admin user, and 5 stock templates (§15).
// Runs as the DB owner (bypasses RLS) — dev/bootstrap only.
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

/** Standard parameter blocks from §6 step 4, shared by all stock templates. */
function baseParamSchema(opts: {
  products?: boolean;
  leadForm?: boolean;
  requireDisclosure?: boolean;
}) {
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
        headline: { type: 'string', title: 'Main headline' },
        subheadline: { type: 'string', title: 'Subheadline' },
        cta_text: { type: 'string', title: 'CTA button text', default: 'Shop Now' },
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
                price: { type: 'string', title: 'Price' },
                compare_price: { type: 'string', title: 'Compare-at price' },
                bullets: {
                  type: 'array', title: 'Bullet points', maxItems: 5,
                  items: { type: 'string' },
                },
                target_url: { type: 'string', format: 'uri', title: 'Product link on store' },
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
              heading: { type: 'string', title: 'Form heading', default: 'Get a free quote' },
              submit_text: { type: 'string', title: 'Submit button text', default: 'Request Callback' },
              collect_phone: { type: 'boolean', title: 'Collect phone number', default: true },
              consent_text: {
                type: 'string', format: 'markdown', title: 'Consent text',
                default: 'I agree to be contacted about this enquiry.',
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
        contact_phone: { type: 'string', title: 'Contact phone' },
        address: { type: 'string', title: 'Physical address' },
      },
    },
    legal: {
      type: 'object',
      title: 'Legal (required to publish)',
      required: opts.requireDisclosure
        ? ['privacy_policy_md', 'terms_md', 'affiliate_disclosure_md']
        : ['privacy_policy_md', 'terms_md'],
      properties: {
        privacy_policy_md: { type: 'string', format: 'markdown', title: 'Privacy policy (min 100 chars)' },
        terms_md: { type: 'string', format: 'markdown', title: 'Terms & conditions' },
        affiliate_disclosure_md: { type: 'string', format: 'markdown', title: 'Affiliate/ad disclosure' },
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
  {
    name: 'Product Showcase',
    category: 'ecom_showcase',
    description:
      'Grid of up to 12 products with prices, bullets, and store links. For catalog-style ad traffic.',
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
    name: 'Comparison Page',
    category: 'comparison',
    description:
      'Compare 2-5 products/options with a recommended pick. Requires affiliate disclosure.',
    paramSchema: baseParamSchema({ products: true, requireDisclosure: true }),
  },
  {
    name: 'Lead Capture',
    category: 'lead_page',
    description:
      'Consented lead form (name/email/phone) with webhook delivery. For service businesses.',
    paramSchema: baseParamSchema({ leadForm: true }),
  },
  {
    name: 'Prelander',
    category: 'prelander',
    description:
      'Advertorial-style pre-landing page warming traffic before the store. Requires affiliate disclosure.',
    paramSchema: baseParamSchema({ requireDisclosure: true }),
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
    const found = await prisma.template.findFirst({
      where: { tenantId: null, name: t.name },
    });
    if (found) {
      await prisma.template.update({
        where: { id: found.id },
        data: { description: t.description, paramSchema: t.paramSchema as any },
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
