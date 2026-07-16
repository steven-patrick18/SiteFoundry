/**
 * Pre-flight validation (§8) — the compliance gate, enforced in code.
 * Param-level rules run here (M2, no server touched). Build-dependent rules
 * (ad claims present in rendered HTML, image URLs return 200, pop-up gate
 * detection, Lighthouse >= 90) run in the install pipeline (M3) and are
 * reported as `pending_build` checks so the operator sees the full list.
 */

export interface PreflightError {
  field: string;
  message: string;
}

export interface PreflightResult {
  ok: boolean;
  errors: PreflightError[];
  pending_build_checks: string[];
}

export interface PreflightInput {
  params: any;
  destinationUrl: string;
  templateCategory: string;
  paramSchema?: any;
  /** extra allowed outbound hosts (tenant affiliate whitelist, Phase 3) */
  extraAllowedHosts?: string[];
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return null;
  }
}

function isHttps(url: string): boolean {
  try {
    return new URL(url).protocol === 'https:';
  } catch {
    return false;
  }
}

export function runPreflight(input: PreflightInput): PreflightResult {
  const errors: PreflightError[] = [];
  const p = input.params ?? {};
  const err = (field: string, message: string) => errors.push({ field, message });

  // -- destination store URL ------------------------------------------------
  const destHost = hostOf(input.destinationUrl);
  if (!destHost) {
    err('destination_url', 'Destination store URL is not a valid URL');
  } else if (!isHttps(input.destinationUrl)) {
    err('destination_url', 'Destination store URL must be HTTPS');
  }
  const allowedHosts = new Set(
    [destHost, ...(input.extraAllowedHosts ?? []).map((h) => h.replace(/^www\./, '').toLowerCase())]
      .filter(Boolean) as string[],
  );

  // -- trust & contact (blocks publish if empty, §6/§8) ----------------------
  const trust = p.trust ?? {};
  if (!trust.business_name?.trim()) err('trust.business_name', 'Business name is required');
  if (!trust.contact_email?.trim()) {
    err('trust.contact_email', 'Contact email is required');
  } else if (!EMAIL_RE.test(trust.contact_email.trim())) {
    err('trust.contact_email', 'Contact email is not a valid email address');
  }
  if (!trust.contact_phone?.trim()) err('trust.contact_phone', 'Contact phone is required');
  if (!trust.address?.trim()) err('trust.address', 'Physical address is required');

  // -- legal (§8) -------------------------------------------------------------
  const legal = p.legal ?? {};
  const privacy = (legal.privacy_policy_md ?? '').trim();
  if (privacy.length < 100) {
    err(
      'legal.privacy_policy_md',
      privacy.length === 0
        ? 'Privacy policy is required'
        : `Privacy policy too short (${privacy.length} chars, minimum 100)`,
    );
  }
  if (!(legal.terms_md ?? '').trim()) {
    err('legal.terms_md', 'Terms & conditions are required');
  }
  const needsDisclosure = ['prelander', 'comparison'].includes(input.templateCategory);
  if (needsDisclosure && !(legal.affiliate_disclosure_md ?? '').trim()) {
    err(
      'legal.affiliate_disclosure_md',
      `Affiliate/ad disclosure is required for ${input.templateCategory} templates`,
    );
  }

  // -- outbound links stay on declared destinations (§8) ----------------------
  const allowedList = [...allowedHosts].join(', ');
  const checkOutbound = (field: string, url: unknown, label: string) => {
    if (!url || typeof url !== 'string') {
      err(field, `${label} is required`);
      return;
    }
    if (!isHttps(url)) {
      err(field, `${label} must be HTTPS`);
      return;
    }
    const host = hostOf(url);
    if (host && destHost && !allowedHosts.has(host)) {
      err(
        field,
        `Outbound link goes off-destination (${host}) — allowed stores: ${allowedList}`,
      );
    }
  };

  const products = Array.isArray(p.products) ? p.products : [];
  products.forEach((product: any, i: number) => {
    checkOutbound(`products[${i}].target_url`, product?.target_url, 'Product link');
    // multi-store offers (price comparison) obey the same gate
    const offers = Array.isArray(product?.offers) ? product.offers : [];
    offers.forEach((offer: any, j: number) => {
      if (!offer?.store_name?.trim()) {
        err(`products[${i}].offers[${j}].store_name`, 'Offer store name is required');
      }
      checkOutbound(`products[${i}].offers[${j}].target_url`, offer?.target_url, 'Offer link');
    });
    if (offers.length > 6) err(`products[${i}].offers`, 'Maximum 6 offers per product');
  });
  if (products.length > 12) err('products', 'Maximum 12 products');

  // -- ad claims (strings themselves; HTML presence verified at build, M3) ----
  const claims = Array.isArray(p.ad_claims) ? p.ad_claims : [];
  claims.forEach((claim: any, i: number) => {
    if (typeof claim !== 'string' || !claim.trim()) {
      err(`ad_claims[${i}]`, 'Ad claim must be a non-empty string');
    }
  });

  // -- template-schema required fields (light JSON-Schema walk) ---------------
  const schema = input.paramSchema;
  if (schema?.properties) {
    for (const [blockKey, blockSchema] of Object.entries<any>(schema.properties)) {
      if (blockSchema?.type !== 'object' || !Array.isArray(blockSchema.required)) continue;
      const block = p[blockKey] ?? {};
      for (const requiredField of blockSchema.required) {
        const value = block[requiredField];
        const already = errors.some((e) => e.field === `${blockKey}.${requiredField}`);
        if (!already && (value === undefined || value === null || String(value).trim() === '')) {
          const title = blockSchema.properties?.[requiredField]?.title ?? requiredField;
          err(`${blockKey}.${requiredField}`, `${title} is required`);
        }
      }
      // maxLength checks (e.g. SEO title < 60, description < 160)
      for (const [fieldKey, fieldSchema] of Object.entries<any>(blockSchema.properties ?? {})) {
        const max = fieldSchema?.maxLength;
        const value = block[fieldKey];
        if (max && typeof value === 'string' && value.length > max) {
          err(
            `${blockKey}.${fieldKey}`,
            `${fieldSchema.title ?? fieldKey} is ${value.length} chars (maximum ${max})`,
          );
        }
      }
    }
  }

  return {
    ok: errors.length === 0,
    errors,
    pending_build_checks: [
      'Ad claims literally present in rendered HTML',
      'All image URLs return HTTP 200',
      'No blocking pop-up gates on page load',
      'Lighthouse performance score >= 90',
    ],
  };
}
