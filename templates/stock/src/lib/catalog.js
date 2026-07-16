// Build-time product catalog, staged by the build worker as catalog.json via
// SF_CATALOG_PATH. It's the accumulated visitor-search cache grouped into
// categories. Astro statically generates a page per product and per category
// from this, so the deployed site is multipage and every product lives on our
// own domain. Empty in previews (no SF_CATALOG_PATH) → single-page fallback.
import { readFileSync } from 'node:fs';

function readJson(envVar, fallback) {
  const path = process.env[envVar];
  if (!path) return fallback;
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return fallback;
  }
}

const raw = readJson('SF_CATALOG_PATH', { categories: [] });
const rawCategories = Array.isArray(raw.categories) ? raw.categories : [];

/** URL-safe slug from arbitrary text. */
export function slugify(s) {
  return (
    String(s || '')
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'item'
  );
}

// Short stable hash (djb2) so two products with the same title get distinct
// URLs, and the same product keeps the same URL across rebuilds.
function shortHash(s) {
  let h = 5381;
  const str = String(s || '');
  for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) >>> 0;
  return h.toString(36).slice(0, 6);
}

export function productSlug(p) {
  return `${slugify(p.title)}-${shortHash(p.link || p.title)}`;
}
export function categorySlugOf(c) {
  return slugify(c.query || c.title);
}

/** First numeric price found, as a plain string (e.g. "1999.00"). */
export function priceNumber(price) {
  const m = String(price == null ? '' : price).replace(/,/g, '').match(/[\d.]+/);
  return m ? m[0] : '';
}

// Build the deduped product index. A product can appear under several
// categories (e.g. an iPhone under "iphone" and "apple"); we keep one page per
// product and remember the first category it appeared in (for the breadcrumb).
const productMap = new Map(); // slug -> product entry
const categories = [];
for (const c of rawCategories) {
  const cslug = categorySlugOf(c);
  const prods = (Array.isArray(c.products) ? c.products : []).filter(
    (p) => p && p.title && p.link,
  );
  const catProducts = [];
  for (const p of prods) {
    const slug = productSlug(p);
    let entry = productMap.get(slug);
    if (!entry) {
      entry = { ...p, slug, categorySlug: cslug, categoryTitle: c.title };
      productMap.set(slug, entry);
    }
    catProducts.push(entry);
  }
  if (catProducts.length) {
    categories.push({ title: c.title, query: c.query, slug: cslug, products: catProducts });
  }
}

export const catalogCategories = categories;
export const catalogProducts = [...productMap.values()];
export const hasCatalog = categories.length > 0;

export function productBySlug(slug) {
  return productMap.get(slug) || null;
}
export function categoryBySlug(slug) {
  return categories.find((c) => c.slug === slug) || null;
}

/** Related products for a detail page: same category first, then fill from the rest. */
export function relatedTo(entry, n = 8) {
  const cat = categoryBySlug(entry.categorySlug);
  const same = (cat ? cat.products : []).filter((p) => p.slug !== entry.slug);
  if (same.length >= n) return same.slice(0, n);
  const sameSet = new Set(same.map((p) => p.slug));
  const extra = catalogProducts.filter((p) => p.slug !== entry.slug && !sameSet.has(p.slug));
  return same.concat(extra).slice(0, n);
}
