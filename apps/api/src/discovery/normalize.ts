/**
 * Normalize SerpApi google_shopping results into the shape the template's
 * product/offer fields use. Pure — unit tested.
 */
export interface DiscoveredProduct {
  title: string;
  link: string;
  store_name: string | null;
  price: string | null;
  extracted_price: number | null;
  compare_price: string | null;
  rating: number | null;
  review_count: number | null;
  delivery_time: string | null;
  shipping_cost: string | null;
  image_url: string | null;
  badge: string | null;
}

export function normalizeShoppingResults(raw: any): DiscoveredProduct[] {
  const items = Array.isArray(raw?.shopping_results) ? raw.shopping_results : [];
  return items
    .map((item: any): DiscoveredProduct | null => {
      const link: string | undefined = item.link ?? item.product_link;
      if (!item.title || !link) return null;
      const delivery: string | null = typeof item.delivery === 'string' ? item.delivery : null;
      // "Free delivery by Wed, Jul 22" style strings double as shipping info
      const isFreeShip = delivery ? /free/i.test(delivery) : false;
      return {
        title: String(item.title).slice(0, 200),
        link,
        store_name: item.source ? String(item.source).slice(0, 120) : null,
        price: item.price ? String(item.price) : null,
        extracted_price:
          typeof item.extracted_price === 'number' ? item.extracted_price : null,
        compare_price: item.old_price ? String(item.old_price) : null,
        rating: typeof item.rating === 'number' ? item.rating : null,
        review_count: typeof item.reviews === 'number' ? item.reviews : null,
        delivery_time: delivery,
        shipping_cost: isFreeShip ? 'Free delivery' : null,
        image_url: item.thumbnail ? String(item.thumbnail) : null,
        badge:
          item.tag && typeof item.tag === 'string' && item.tag.length <= 40
            ? item.tag
            : null,
      };
    })
    .filter((p: DiscoveredProduct | null): p is DiscoveredProduct => p !== null);
}
