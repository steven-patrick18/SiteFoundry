/**
 * Product Finder — searches real stores via the panel's discovery API
 * (SerpApi, server-side, locally cached) and imports results into the
 * wizard as products or as price-comparison offers on an existing product.
 */
import { useEffect, useState } from 'react';
import { api } from '../lib/api';

interface Discovered {
  title: string;
  link: string;
  store_name: string | null;
  price: string | null;
  compare_price: string | null;
  rating: number | null;
  review_count: number | null;
  delivery_time: string | null;
  shipping_cost: string | null;
  image_url: string | null;
  badge: string | null;
}

interface DiscoveryResponse {
  cached: boolean;
  results: Discovered[];
  api_searches_this_month: number;
}

export default function ProductFinder({
  products,
  onAddProduct,
  onAddOffer,
}: {
  products: any[];
  onAddProduct: (product: any, host: string) => void;
  onAddOffer: (productIndex: number, offer: any, host: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const [response, setResponse] = useState<DiscoveryResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [offerTarget, setOfferTarget] = useState(-1); // -1 = add as new product

  useEffect(() => {
    api<{ enabled: boolean }>('/discovery/status')
      .then((s) => setEnabled(s.enabled))
      .catch(() => setEnabled(false));
  }, []);

  async function run() {
    if (q.trim().length < 2) return;
    setBusy(true);
    setError(null);
    try {
      setResponse(
        await api<DiscoveryResponse>(`/discovery/products?q=${encodeURIComponent(q.trim())}`),
      );
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  function hostOf(url: string): string {
    try {
      return new URL(url).hostname.replace(/^www\./, '').toLowerCase();
    } catch {
      return '';
    }
  }

  function importItem(item: Discovered) {
    const host = hostOf(item.link);
    if (offerTarget >= 0) {
      onAddOffer(
        offerTarget,
        {
          store_name: item.store_name ?? host,
          price: item.price ?? '',
          shipping_cost: item.shipping_cost ?? '',
          delivery_time: item.delivery_time ?? '',
          badge: item.badge ?? '',
          target_url: item.link,
        },
        host,
      );
    } else {
      onAddProduct(
        {
          title: item.title,
          image_url: item.image_url ?? '',
          price: item.price ?? '',
          compare_price: item.compare_price ?? '',
          rating: item.rating ?? undefined,
          review_count: item.review_count ?? undefined,
          store_name: item.store_name ?? host,
          delivery_time: item.delivery_time ?? '',
          shipping_cost: item.shipping_cost ?? '',
          badge: item.badge ?? '',
          bullets: [],
          target_url: item.link,
          offers: [],
        },
        host,
      );
    }
  }

  if (enabled === false) {
    return (
      <p className="sub" style={{ marginBottom: 12 }}>
        Product Finder is off — set SERPAPI_KEY in the panel environment to
        search real stores and import products automatically.
      </p>
    );
  }

  return (
    <>
      <div style={{ marginBottom: 14 }}>
        <button type="button" onClick={() => setOpen(true)}>
          🔍 Find products in real stores
        </button>
        <span className="sub" style={{ marginLeft: 10 }}>
          Searches are cached locally — repeat queries cost no API credits.
        </span>
      </div>

      {open && (
        <div className="modal-backdrop" onClick={() => setOpen(false)}>
          <div className="modal" style={{ width: 720 }} onClick={(e) => e.stopPropagation()}>
            <h2>Find products (US market)</h2>
            <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && void run()}
                placeholder="window air conditioner 12000 btu"
                autoFocus
              />
              <button disabled={busy} onClick={() => void run()}>
                {busy ? 'Searching…' : 'Search'}
              </button>
            </div>
            <label style={{ marginTop: 10 }}>
              Import as
              <select value={offerTarget} onChange={(e) => setOfferTarget(Number(e.target.value))}>
                <option value={-1}>New product</option>
                {products.map((p, i) => (
                  <option key={i} value={i}>
                    Price offer on: {p?.title ?? `product #${i + 1}`}
                  </option>
                ))}
              </select>
            </label>
            {error && <div className="error">{error}</div>}
            {response && (
              <>
                <p className="sub" style={{ margin: '8px 0' }}>
                  {response.results.length} results
                  {response.cached ? ' · from local cache (0 credits)' : ' · fresh (1 credit)'}
                  {' '}· {response.api_searches_this_month} API searches used this month
                </p>
                <div className="finder-results">
                  {response.results.map((item, i) => (
                    <div key={i} className="finder-row">
                      {item.image_url ? (
                        <img src={item.image_url} alt="" />
                      ) : (
                        <div className="finder-noimg" />
                      )}
                      <div className="finder-main">
                        <strong>{item.title}</strong>
                        <span className="sub">
                          {[item.store_name, item.rating != null ? `★ ${item.rating} (${item.review_count?.toLocaleString() ?? 0})` : null, item.delivery_time]
                            .filter(Boolean)
                            .join(' · ')}
                        </span>
                      </div>
                      <div className="finder-price">
                        {item.price}
                        {item.compare_price && <s>{item.compare_price}</s>}
                      </div>
                      <button type="button" onClick={() => importItem(item)}>
                        {offerTarget >= 0 ? '+ Offer' : '+ Add'}
                      </button>
                    </div>
                  ))}
                </div>
              </>
            )}
            <div className="modal-actions">
              <button onClick={() => setOpen(false)}>Done</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
